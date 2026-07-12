/**
 * Memory CRUD + lookup helpers. All paths through here own at most one
 * audit-log write (`logEvent`) and stay schema-tolerant — `coalesce` is
 * used everywhere a property might be missing on legacy nodes.
 *
 * `listMemories` is the unified list+search path. Filters (profile, type,
 * status, source, tags, search) are pushed into Cypher so the frontend
 * paginates a filtered subset in constant time. `searchMemories` (in
 * `search.ts`) is just a thin wrapper around it.
 */

import Cypher from "@neo4j/cypher-builder";
import crypto from "node:crypto";
import neo4j, {
  type Driver,
  type Integer,
  type QueryResult,
  type Session,
} from "neo4j-driver";
import { buildAndRun } from "../cypherHelpers";
import { toMemoryContentFulltextQuery } from "../luceneQuery";
import { neo4jGet, parseNeo4jInt } from "../record";
import { toMemoryWithTags, toSnapshot } from "./mappers";
import { createSemanticSimilarityEdges } from "./relationships";
import { logEvent, withSession } from "./shared";
import { normalizeTags } from "./tagNormalize";
import {
  type MemoryStatus,
  type MemoryType,
  type MemoryWithTags,
} from "./types";

/** Lightweight memory reference returned by the dedup-lookup helpers. */
export type MemoryRef = { id: string; title: string; updatedAt: string };

/**
 * Extract the `{id, title, updatedAt}` shape from a query's first record, or
 * null when the query matched nothing. Shared by every `findMemoryBy*` dedup
 * lookup — they all run a single-row MATCH and return this same projection.
 */
function firstMemoryRef(result: QueryResult): MemoryRef | null {
  const r = result.records[0];
  if (!r) return null;
  return {
    id: String(neo4jGet(r, "id")),
    title: String(neo4jGet(r, "title")),
    updatedAt: String(neo4jGet(r, "updatedAt")),
  };
}

export async function createMemory(
  driver: Driver,
  params: {
    userId: string;
    profileId: string;
    title: string;
    content: string;
    type: MemoryType;
    source: string;
    tags: string[];
    confidence: number;
    expiresAt?: string;
    url?: string;
    // Pre-computed embedding vector (1536 dims for text-embedding-3-small).
    // Null ⇒ user has no OPENROUTER_API_KEY set, or generation failed.
    // Memories created without an embedding are still usable; the backfill
    // migration fills them later, and retrieval degrades to fulltext-only.
    embedding: number[] | null;
    // MD5 hex digest of normalized(title + content). Used for exact-duplicate
    // detection on subsequent creates.
    contentHash: string;
    // External ID idempotency. When both are provided, the memory node is
    // tagged with `sourceType` + `sourceId` properties so the same external
    // entity (file upload, Twitter bookmark, etc.) can be recognized across
    // re-imports. The composite index `memory_source_id` (setup.ts) covers
    // these. Reuses the same shape that `upsertFromSource` writes for
    // connectors.
    sourceType?: string;
    sourceId?: string;
    // File-upload metadata. Optional; only populated by the file-upload pipeline.
    storageId?: string;
    mimeType?: string;
    originalFilename?: string;
  },
): Promise<MemoryWithTags> {
  return withSession(driver, async (session) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const result = await session.run(
      `CREATE (m:Memory {
        id: $id,
        userId: $userId,
        profileId: $profileId,
        title: $title,
        content: $content,
        type: $type,
        source: $source,
        confidence: $confidence,
        status: 'active',
        createdAt: $now,
        updatedAt: $now,
        expiresAt: $expiresAt,
        url: $url,
        embedding: $embedding,
        contentHash: $contentHash,
        sourceType: $sourceType,
        sourceId: $sourceId,
        storageId: $storageId,
        mimeType: $mimeType,
        originalFilename: $originalFilename,
        visitCount: 1,
        firstVisitAt: $now,
        lastVisitAt: $now
      })
      WITH m
      MERGE (s:Source {name: $source})
      CREATE (m)-[:FROM_SOURCE]->(s)
      WITH m
      FOREACH (tagName IN $tags |
        MERGE (t:Tag {name: tagName})
        MERGE (m)-[:TAGGED_WITH]->(t)
      )
      WITH m
      OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
      RETURN m, collect(DISTINCT t.name) AS tags`,
      {
        id,
        userId: params.userId,
        profileId: params.profileId,
        title: params.title,
        content: params.content,
        type: params.type,
        source: params.source,
        confidence: params.confidence,
        // Chokepoint normalization: client tags (MCP, HTTP API, web form)
        // arrive raw — "GCP" vs "gcp" would mint separate Tag nodes.
        tags: normalizeTags(params.tags),
        now,
        expiresAt: params.expiresAt ?? null,
        url: params.url ?? null,
        embedding: params.embedding,
        contentHash: params.contentHash,
        sourceType: params.sourceType ?? null,
        sourceId: params.sourceId ?? null,
        storageId: params.storageId ?? null,
        mimeType: params.mimeType ?? null,
        originalFilename: params.originalFilename ?? null,
      },
    );

    const snapshot = toSnapshot({
      title: params.title,
      content: params.content,
      type: params.type,
      status: "active",
      confidence: params.confidence,
      tags: params.tags,
    });

    await logEvent(
      session,
      id,
      "created",
      params.source,
      { type: params.type },
      snapshot,
    );

    // Only create "same session" edges for interactive sources, not batch imports.
    // Batch sources like browsing-history/bookmarks create O(n²) junk edges.
    const BATCH_SOURCES = new Set([
      "browsing-history",
      "bookmarks",
      "google_drive",
      "notion",
      "onedrive",
      "linear",
      "gmail",
    ]);

    if (!BATCH_SOURCES.has(params.source)) {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await session.run(
        `MATCH (m:Memory {id: $id}), (m2:Memory {userId: $userId, source: $source})
         WHERE m2.id <> $id AND m2.createdAt > $cutoff
         MERGE (m2)-[r:RELATES_TO]->(m)
         ON CREATE SET r.reason = 'same session'`,
        {
          id,
          userId: params.userId,
          source: params.source,
          cutoff,
        },
      );
    }

    // NOTE: there is deliberately NO "same domain" edge between URL memories.
    // It existed once and produced 73% of all RELATES_TO edges as noise:
    // platform domains dominate real browsing (youtube.com, github.com,
    // google.com), so "same domain" is platform affinity, not topical
    // relation — and its un-ordered LIMIT 10 concentrated an unbounded
    // incoming-edge star on the ~10 oldest memories per domain (worst node:
    // 578 edges). Genuinely related pages are covered by the two similarity
    // paths below; browsing bursts by the same-session edge above.

    // Semantic similarity edges — see createSemanticSimilarityEdges in relationships.ts.
    if (params.embedding !== null) {
      await createSemanticSimilarityEdges(
        session,
        id,
        params.userId,
        params.embedding,
      );
    }

    const firstRecord = result.records[0];
    if (!firstRecord) throw new Error("Failed to create memory");
    return toMemoryWithTags(firstRecord);
  });
}

export async function getMemory(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<MemoryWithTags | null> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       RETURN m, collect(t.name) AS tags`,
      { memoryId, userId },
    );

    const firstRecord = result.records[0];
    if (!firstRecord) return null;
    return toMemoryWithTags(firstRecord);
  });
}

export async function listMemories(
  driver: Driver,
  params: {
    userId: string;
    profileId?: string | null;
    type?: MemoryType;
    status?: MemoryStatus;
    source?: string;
    tags?: string[];
    searchQuery?: string;
    limit: number;
    offset: number;
  },
): Promise<{ memories: MemoryWithTags[]; total: number }> {
  return withSession(driver, async (session) => {
    // Unified list + search path. All filters (profile, type, status,
    // source, tags, search) are pushed into Cypher so the frontend can
    // paginate a filtered subset in constant time rather than fetch every
    // memory and filter in JS.
    //
    // When `searchQuery` is present, the MATCH starts from the fulltext
    // index hit; otherwise it scans the memory_user_status_created
    // composite index (most recent active memories first).
    //
    // Count + page are still two sequential session.run() calls because a
    // combined CALL{} pattern that joins them drops the count row whenever
    // the page query returns zero rows (e.g. user scrolls past the end).
    // That bug used to silently break pagination UIs, so the guard stays.
    const queryParams: Record<
      string,
      string | number | Integer | string[] | null
    > = {
      userId: params.userId,
      limit: neo4j.int(params.limit),
      offset: neo4j.int(params.offset),
    };

    const whereClauses: string[] = ["m.userId = $userId"];
    if (params.profileId !== undefined && params.profileId !== null) {
      whereClauses.push("(m.profileId = $profileId OR m.profileId IS NULL)");
      queryParams.profileId = params.profileId;
    }
    if (params.type) {
      whereClauses.push("m.type = $type");
      queryParams.type = params.type;
    }
    if (params.status) {
      whereClauses.push("m.status = $status");
      queryParams.status = params.status;
    } else {
      // Default: hide suppressed/expired. Matches the graph view and
      // closes a latent bug where the search path ignored status entirely.
      whereClauses.push("coalesce(m.status, 'active') IN ['active', 'pinned']");
    }
    if (params.source) {
      whereClauses.push("m.source = $source");
      queryParams.source = params.source;
    }

    const where = whereClauses.join(" AND ");

    const filterTags = params.tags ?? [];
    const hasTagFilter = filterTags.length > 0;
    if (hasTagFilter) {
      queryParams.filterTags = filterTags;
    }
    const filterTagsCount = filterTags.length;

    const luceneSearchQuery = toMemoryContentFulltextQuery(
      params.searchQuery ?? "",
    );
    const hasSearchQuery = luceneSearchQuery !== null;
    if (hasSearchQuery) {
      queryParams.searchQuery = luceneSearchQuery;
    }

    // Index-joined tag filter: match the Tag node directly (hits the
    // Tag(name) unique-constraint index) and require matched-tag count to
    // equal the number of filter tags. Avoids scanning every TAGGED_WITH
    // edge per memory. Forwards `score` alongside `m` when the search path
    // is active so the subsequent ORDER BY can still see it.
    const tagMatchClause = hasTagFilter
      ? `MATCH (m)-[:TAGGED_WITH]->(ft:Tag) WHERE ft.name IN $filterTags
         WITH m${hasSearchQuery ? ", score" : ""}, count(DISTINCT ft) AS matchedTags
         WHERE matchedTags = ${filterTagsCount}`
      : "";

    // The matchPrefix picks the query anchor: fulltext index when the user
    // is searching, Memory(userId,status,createdAt) composite index
    // otherwise. The orderClause decides how the page is sorted.
    const matchPrefix = hasSearchQuery
      ? `CALL db.index.fulltext.queryNodes('memory_content', $searchQuery) YIELD node AS m, score
         WHERE ${where}`
      : `MATCH (m:Memory) WHERE ${where}`;
    const orderClause = hasSearchQuery
      ? "WITH m, score ORDER BY score DESC"
      : "WITH m ORDER BY m.createdAt DESC";

    const countResult = await session.run(
      `${matchPrefix}
       ${tagMatchClause}
       RETURN count(m) AS total`,
      queryParams,
    );
    const countRecord = countResult.records[0];
    const total = countRecord
      ? parseNeo4jInt(neo4jGet(countRecord, "total"))
      : 0;

    const result = await session.run(
      `${matchPrefix}
       ${tagMatchClause}
       ${orderClause} SKIP $offset LIMIT $limit
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       RETURN m, collect(t.name) AS tags`,
      queryParams,
    );
    const memories = result.records.map(toMemoryWithTags);
    return { memories, total };
  });
}

export async function updateMemory(
  driver: Driver,
  userId: string,
  memoryId: string,
  updates: {
    title?: string;
    content?: string;
    type?: MemoryType;
    status?: MemoryStatus;
    tags?: string[];
    confidence?: number;
    expiresAt?: string | null;
  },
): Promise<MemoryWithTags | null> {
  return withSession(driver, async (session) => {
    const m = new Cypher.NamedNode("m");
    const t = new Cypher.Node();

    const setParams: Cypher.SetParam[] = [
      [m.property("updatedAt"), new Cypher.Param(new Date().toISOString())],
    ];
    if (updates.title !== undefined) {
      setParams.push([m.property("title"), new Cypher.Param(updates.title)]);
    }
    if (updates.content !== undefined) {
      setParams.push([
        m.property("content"),
        new Cypher.Param(updates.content),
      ]);
    }
    if (updates.type !== undefined) {
      setParams.push([m.property("type"), new Cypher.Param(updates.type)]);
    }
    if (updates.status !== undefined) {
      setParams.push([m.property("status"), new Cypher.Param(updates.status)]);
    }
    if (updates.confidence !== undefined) {
      setParams.push([
        m.property("confidence"),
        new Cypher.Param(updates.confidence),
      ]);
    }
    if (updates.expiresAt !== undefined) {
      setParams.push([
        m.property("expiresAt"),
        new Cypher.Param(updates.expiresAt),
      ]);
    }

    const matchWithSet = new Cypher.Match(
      new Cypher.Pattern(m, {
        labels: ["Memory"],
        properties: {
          id: new Cypher.Param(memoryId),
          userId: new Cypher.Param(userId),
        },
      }),
    ).set(...setParams);

    let tagUpdate: Cypher.Raw | undefined;
    if (updates.tags !== undefined) {
      const newTags = normalizeTags(updates.tags);
      tagUpdate = new Cypher.Raw(() => [
        `WITH m
OPTIONAL MATCH (m)-[r:TAGGED_WITH]->(:Tag)
DELETE r
WITH m
UNWIND $newTags AS tagName
MERGE (tag:Tag {name: tagName})
MERGE (m)-[:TAGGED_WITH]->(tag)`,
        { newTags },
      ]);
    }

    const returnPart = new Cypher.With(m)
      .optionalMatch(
        new Cypher.Pattern(m)
          .related({ type: "TAGGED_WITH", direction: "right" })
          .to(t, { labels: ["Tag"] }),
      )
      .return(m, [Cypher.collect(t.property("name")).distinct(), "tags"]);

    const query = Cypher.utils.concat(matchWithSet, tagUpdate, returnPart);
    const result = await buildAndRun(session, query);

    const firstRecord = result.records[0];
    if (!firstRecord) return null;
    const updated = toMemoryWithTags(firstRecord);
    await logEvent(
      session,
      memoryId,
      "updated",
      "api",
      {},
      toSnapshot(updated),
    );
    return updated;
  });
}

export async function deleteMemory(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<boolean> {
  return withSession(driver, async (session) => {
    // Cascade-delete chunks first — they are :Chunk nodes linked via
    // HAS_CHUNK and DETACH DELETE on the parent only severs the edge,
    // it does not remove the chunk node. Done in two passes on the
    // same session so we never DETACH DELETE before removing chunks.
    await session.run(
      `MATCH (c:Chunk {memoryId: $memoryId, userId: $userId})
       DETACH DELETE c`,
      { memoryId, userId },
    );
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})
       DETACH DELETE m
       RETURN count(m) AS deleted`,
      { memoryId, userId },
    );
    const firstRecord = result.records[0];
    if (!firstRecord) return false;
    return parseNeo4jInt(neo4jGet(firstRecord, "deleted")) > 0;
  });
}

/** Prune Tag/Source nodes no memory still references (global UNIQUE names). */
async function deleteOrphanTagsAndSources(session: Session): Promise<void> {
  await session.run(
    `MATCH (t:Tag)
     WHERE NOT EXISTS { MATCH (:Memory)-[:TAGGED_WITH]->(t) }
     DELETE t`,
  );
  await session.run(
    `MATCH (s:Source)
     WHERE NOT EXISTS { MATCH (:Memory)-[:FROM_SOURCE]->(s) }
     DELETE s`,
  );
}

/**
 * Remove every memory imported from the given connector source types, plus
 * their chunks, events, and proposed updates. Does not disconnect OAuth or
 * wipe unrelated memories.
 */
export async function deleteMemoriesBySourceTypes(
  driver: Driver,
  userId: string,
  sourceTypes: readonly string[],
): Promise<number> {
  if (sourceTypes.length === 0) {
    return 0;
  }

  return withSession(driver, async (session) => {
    await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.sourceType IN $sourceTypes OR m.source IN $sourceTypes
       WITH collect(m.id) AS memoryIds
       MATCH (c:Chunk {userId: $userId})
       WHERE c.memoryId IN memoryIds
       DETACH DELETE c`,
      { userId, sourceTypes },
    );
    await session.run(
      `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
       WHERE m.sourceType IN $sourceTypes OR m.source IN $sourceTypes
       DETACH DELETE e`,
      { userId, sourceTypes },
    );
    await session.run(
      `MATCH (p:ProposedUpdate)-[:UPDATE_FOR]->(m:Memory {userId: $userId})
       WHERE m.sourceType IN $sourceTypes OR m.source IN $sourceTypes
       DETACH DELETE p`,
      { userId, sourceTypes },
    );
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.sourceType IN $sourceTypes OR m.source IN $sourceTypes
       DETACH DELETE m
       RETURN count(m) AS deleted`,
      { userId, sourceTypes },
    );
    await deleteOrphanTagsAndSources(session);
    const firstRecord = result.records[0];
    if (!firstRecord) return 0;
    return parseNeo4jInt(neo4jGet(firstRecord, "deleted"));
  });
}

/**
 * Wipe every memory the user owns and every node that exists only to
 * support those memories: chunks, memory events, proposed updates, and
 * per-user entities. Tags and sources are global (`UNIQUE` on name) so
 * we only prune the orphans — names other users still reference stay.
 *
 * Mirrors `unseed.ts`'s ordering: child rows first, then memories, then
 * orphan cleanup, so DETACH DELETE never has to walk into a child it
 * was supposed to remove on its own.
 */
export async function deleteAllMemoriesForUser(
  driver: Driver,
  userId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    await session.run(
      `MATCH (c:Chunk {userId: $userId})
       DETACH DELETE c`,
      { userId },
    );
    await session.run(
      `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
       DETACH DELETE e`,
      { userId },
    );
    await session.run(
      `MATCH (p:ProposedUpdate)-[:UPDATE_FOR]->(m:Memory {userId: $userId})
       DETACH DELETE p`,
      { userId },
    );
    await session.run(
      `MATCH (e:Entity {userId: $userId})
       DETACH DELETE e`,
      { userId },
    );
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       DETACH DELETE m
       RETURN count(m) AS deleted`,
      { userId },
    );
    await deleteOrphanTagsAndSources(session);
    const firstRecord = result.records[0];
    if (!firstRecord) return 0;
    return parseNeo4jInt(neo4jGet(firstRecord, "deleted"));
  });
}

export async function findMemoryByUrl(
  driver: Driver,
  userId: string,
  url: string,
): Promise<MemoryRef | null> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, url: $url})
       WHERE m.status IN ['active', 'pinned']
       RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
       LIMIT 1`,
      { userId, url },
    );
    return firstMemoryRef(result);
  });
}

/**
 * Increment visit count for an existing URL-based memory.
 * Called when a duplicate URL is detected during import.
 */
export async function incrementVisitCount(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<{ visitCount: number; lastVisitAt: string }> {
  return withSession(driver, async (session) => {
    const now = new Date().toISOString();
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})
       SET m.visitCount = coalesce(m.visitCount, 1) + 1,
           m.lastVisitAt = $now,
           m.updatedAt = $now
       RETURN m.visitCount AS visitCount, m.lastVisitAt AS lastVisitAt`,
      { memoryId, userId, now },
    );
    const r = result.records[0];
    if (!r) {
      return { visitCount: 1, lastVisitAt: now };
    }
    return {
      visitCount: parseNeo4jInt(neo4jGet(r, "visitCount")),
      lastVisitAt: String(neo4jGet(r, "lastVisitAt")),
    };
  });
}

/**
 * Dedup short-circuit: bump visit count and return the full memory row.
 * Returns null when the node disappeared between match and read (race).
 */
export async function finalizeDedupHit(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<MemoryWithTags | null> {
  await incrementVisitCount(driver, userId, memoryId);
  return getMemory(driver, userId, memoryId);
}

/** Bump visit count and return the full row when a dedup lookup matched. */
export async function shortCircuitOnDedupMatch(
  driver: Driver,
  userId: string,
  ref: MemoryRef | null,
): Promise<MemoryWithTags | null> {
  if (!ref) return null;
  return finalizeDedupHit(driver, userId, ref.id);
}

/**
 * Find an existing browsing-history/bookmarks memory with the same title
 * from the same origin (protocol+host). Catches the "every page on my app
 * has <title>vmem</title>" problem.
 */
export async function findMemoryByTitleAndOrigin(
  driver: Driver,
  userId: string,
  title: string,
  origin: string,
): Promise<MemoryRef | null> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, title: $title})
       WHERE m.status IN ['active', 'pinned']
         AND m.source IN ['browsing-history', 'bookmarks']
         AND m.url STARTS WITH $origin
       RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
       ORDER BY m.visitCount DESC, m.createdAt ASC
       LIMIT 1`,
      { userId, title, origin },
    );
    return firstMemoryRef(result);
  });
}

/**
 * Find an active/pinned memory with the same content hash (exact duplicate).
 * Uses the (userId, contentHash) composite index for O(1) lookup.
 */
export async function findMemoryByContentHash(
  driver: Driver,
  userId: string,
  contentHash: string,
): Promise<MemoryRef | null> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, contentHash: $contentHash})
       WHERE m.status IN ['active', 'pinned']
       RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
       LIMIT 1`,
      { userId, contentHash },
    );
    return firstMemoryRef(result);
  });
}

/**
 * Find an existing memory by its (sourceType, sourceId) tuple — the
 * external-ID idempotency lookup. Used by callers who can supply a stable
 * external identifier (file content hash, Twitter bookmark ID, etc.) so
 * re-imports return the same memory without going through hash/URL/semantic
 * dedup. Backed by the composite index `memory_source_id` in setup.ts.
 */
export async function findMemoryByExternalId(
  driver: Driver,
  userId: string,
  sourceType: string,
  sourceId: string,
): Promise<MemoryRef | null> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, sourceType: $sourceType, sourceId: $sourceId})
       WHERE m.status IN ['active', 'pinned']
       RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
       LIMIT 1`,
      { userId, sourceType, sourceId },
    );
    return firstMemoryRef(result);
  });
}

/**
 * Find the most semantically similar active/pinned memory above `threshold`.
 * Uses the vector index — only callable when an embedding is available.
 * Returns null when no memory exceeds the threshold.
 */
export async function findMemoryBySimilarity(
  driver: Driver,
  userId: string,
  embedding: number[],
  threshold: number,
): Promise<{
  id: string;
  title: string;
  updatedAt: string;
  similarity: number;
} | null> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
       YIELD node AS m, score AS similarity
       WHERE m.userId = $userId
         AND m.status IN ['active', 'pinned']
         AND similarity >= $threshold
       RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt, similarity
       ORDER BY similarity DESC
       LIMIT 1`,
      {
        k: neo4j.int(5),
        embedding,
        userId,
        threshold,
      },
    );
    const r = result.records[0];
    if (!r) return null;
    return {
      id: String(neo4jGet(r, "id")),
      title: String(neo4jGet(r, "title")),
      updatedAt: String(neo4jGet(r, "updatedAt")),
      similarity: Number(neo4jGet(r, "similarity")),
    };
  });
}
