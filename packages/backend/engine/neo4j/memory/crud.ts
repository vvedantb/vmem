import type { Driver, Integer, QueryResult, Session } from "neo4j-driver";
import crypto from "node:crypto";
import neo4j from "neo4j-driver";
import { toMemoryContentFulltextQuery } from "../luceneQuery";
import { firstNeo4jInt, neo4jGet, neo4jInt } from "../record";
import { withSession } from "../session";
import { toMemoryWithTags, toSnapshot } from "./mappers";
import { createSemanticSimilarityEdges } from "./relationships";
import { logEvent, visibleStatusClause } from "./shared";
import { normalizeTags } from "./tagNormalize";
import type { MemoryStatus, MemoryType, MemoryWithTags } from "./types";

export type MemoryRef = { id: string; title: string; updatedAt: string };

const BATCH_SOURCES = new Set([
  "browsing-history",
  "bookmarks",
  "google_drive",
  "notion",
]);

function propsClause(props: Record<string, string>): string {
  return Object.keys(props)
    .map((k) => `${k}: $${k}`)
    .join(", ");
}

function parseDeletedCount(result: QueryResult): number {
  return firstNeo4jInt(result, "deleted");
}

function firstMemoryRef(result: QueryResult): MemoryRef | null {
  const r = result.records[0];
  if (!r) return null;
  return {
    id: String(neo4jGet(r, "id")),
    title: String(neo4jGet(r, "title")),
    updatedAt: String(neo4jGet(r, "updatedAt")),
  };
}

export async function fetchMemoryWithTags(
  driver: Driver,
  matchProps: Record<string, string>,
): Promise<MemoryWithTags | null> {
  const result = await driver.executeQuery(
    `MATCH (m:Memory {${propsClause(matchProps)}})
     OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
     RETURN m, collect(t.name) AS tags`,
    matchProps,
  );
  const firstRecord = result.records[0];
  if (!firstRecord) return null;
  return toMemoryWithTags(firstRecord);
}

export async function detachDeleteCount(
  session: Session,
  matchProps: Record<string, string>,
): Promise<boolean> {
  const result = await session.run(
    `MATCH (m:Memory {${propsClause(matchProps)}})
     DETACH DELETE m
     RETURN count(m) AS deleted`,
    matchProps,
  );
  return parseDeletedCount(result) > 0;
}

async function findMemoryRef(
  driver: Driver,
  matchProps: Record<string, string>,
  opts?: {
    extraWhere?: string;
    orderBy?: string;
    extraParams?: Record<string, string>;
  },
): Promise<MemoryRef | null> {
  const result = await driver.executeQuery(
    `MATCH (m:Memory {${propsClause(matchProps)}})
     WHERE ${visibleStatusClause("m", false)}${opts?.extraWhere ? ` AND ${opts.extraWhere}` : ""}
     RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
     ${opts?.orderBy ? `ORDER BY ${opts.orderBy}` : ""}
     LIMIT 1`,
    { ...matchProps, ...opts?.extraParams },
  );
  return firstMemoryRef(result);
}

export async function runMemoryList(
  session: Session,
  baseWhere: string,
  baseParams: Record<string, string | number | Integer | string[] | null>,
  params: {
    type?: MemoryType;
    status?: MemoryStatus;
    source?: string;
    tags?: string[];
    searchQuery?: string;
    limit: number;
    offset: number;
  },
): Promise<{ memories: MemoryWithTags[]; total: number }> {
  // count + page stay separate: a combined query drops the count when the page is empty
  const queryParams: Record<
    string,
    string | number | Integer | string[] | null
  > = {
    ...baseParams,
    limit: neo4j.int(params.limit),
    offset: neo4j.int(params.offset),
  };

  const whereClauses: string[] = [baseWhere];
  if (params.type) {
    whereClauses.push("m.type = $type");
    queryParams.type = params.type;
  }
  if (params.status) {
    whereClauses.push("m.status = $status");
    queryParams.status = params.status;
  } else {
    whereClauses.push(visibleStatusClause("m"));
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

  const tagMatchClause = hasTagFilter
    ? `MATCH (m)-[:TAGGED_WITH]->(ft:Tag) WHERE ft.name IN $filterTags
       WITH m${hasSearchQuery ? ", score" : ""}, count(DISTINCT ft) AS matchedTags
       WHERE matchedTags = ${filterTagsCount}`
    : "";

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
  const total = firstNeo4jInt(countResult, "total");

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
}

// AI-generated (Claude), prompt: "implement memory create update delete with tag edges events cascade cleanup and similarity lookup helpers"
// Modified by me: content hash fields and orphan tag source cleanup
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
    embedding: number[] | null;
    contentHash: string;
    sourceType?: string;
    sourceId?: string;
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
  return fetchMemoryWithTags(driver, { id: memoryId, userId });
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
    const baseParams: Record<
      string,
      string | number | Integer | string[] | null
    > = { userId: params.userId };
    const baseWhere =
      params.profileId !== undefined && params.profileId !== null
        ? "m.userId = $userId AND (m.profileId = $profileId OR m.profileId IS NULL)"
        : "m.userId = $userId";
    if (params.profileId !== undefined && params.profileId !== null) {
      baseParams.profileId = params.profileId;
    }
    return runMemoryList(session, baseWhere, baseParams, params);
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
    const now = new Date().toISOString();
    const setClauses = ["m.updatedAt = $now"];
    const params: Record<string, unknown> = { memoryId, userId, now };

    if (updates.title !== undefined) {
      setClauses.push("m.title = $title");
      params.title = updates.title;
    }
    if (updates.content !== undefined) {
      setClauses.push("m.content = $content");
      params.content = updates.content;
    }
    if (updates.type !== undefined) {
      setClauses.push("m.type = $type");
      params.type = updates.type;
    }
    if (updates.status !== undefined) {
      setClauses.push("m.status = $status");
      params.status = updates.status;
    }
    if (updates.confidence !== undefined) {
      setClauses.push("m.confidence = $confidence");
      params.confidence = updates.confidence;
    }
    if (updates.expiresAt !== undefined) {
      setClauses.push("m.expiresAt = $expiresAt");
      params.expiresAt = updates.expiresAt;
    }

    let cypher = `MATCH (m:Memory {id: $memoryId, userId: $userId})
                  SET ${setClauses.join(", ")}`;

    if (updates.tags !== undefined) {
      params.newTags = normalizeTags(updates.tags);
      // characterization: UNWIND on an empty $newTags drops the row, so tag clears
      // apply but RETURN is empty → null result and no update event.
      cypher += `
        WITH m
        OPTIONAL MATCH (m)-[r:TAGGED_WITH]->(:Tag)
        DELETE r
        WITH m
        UNWIND $newTags AS tagName
        MERGE (tag:Tag {name: tagName})
        MERGE (m)-[:TAGGED_WITH]->(tag)`;
    }

    cypher += `
      WITH m
      OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
      RETURN m, collect(t.name) AS tags`;

    const result = await session.run(cypher, params);

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

async function deleteChunksForMemory(
  session: Session,
  memoryId: string,
  userId: string,
): Promise<void> {
  await session.run(
    `MATCH (c:Chunk {memoryId: $memoryId, userId: $userId})
     DETACH DELETE c`,
    { memoryId, userId },
  );
}

export async function deleteMemory(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<boolean> {
  return withSession(driver, async (session) => {
    await deleteChunksForMemory(session, memoryId, userId);
    return detachDeleteCount(session, { id: memoryId, userId });
  });
}

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

const MEMORY_SOURCE_TYPE_WHERE =
  "m.sourceType IN $sourceTypes OR m.source IN $sourceTypes";

async function deleteChunksForUserMemoriesWhere(
  session: Session,
  userId: string,
  memoryWhere: string,
  extraParams: Record<string, unknown>,
): Promise<void> {
  await session.run(
    `MATCH (m:Memory {userId: $userId})
     WHERE ${memoryWhere}
     WITH collect(m.id) AS memoryIds
     MATCH (c:Chunk {userId: $userId})
     WHERE c.memoryId IN memoryIds
     DETACH DELETE c`,
    { userId, ...extraParams },
  );
}

async function deleteMemoryEventsForUserMemoriesWhere(
  session: Session,
  userId: string,
  memoryWhere: string,
  extraParams: Record<string, unknown>,
): Promise<void> {
  await session.run(
    `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
     WHERE ${memoryWhere}
     DETACH DELETE e`,
    { userId, ...extraParams },
  );
}

async function deleteProposalsForUserMemoriesWhere(
  session: Session,
  userId: string,
  memoryWhere: string,
  extraParams: Record<string, unknown>,
): Promise<void> {
  await session.run(
    `MATCH (p:ProposedUpdate)-[:UPDATE_FOR]->(m:Memory {userId: $userId})
     WHERE ${memoryWhere}
     DETACH DELETE p`,
    { userId, ...extraParams },
  );
}

export async function deleteMemoriesBySourceTypes(
  driver: Driver,
  userId: string,
  sourceTypes: readonly string[],
): Promise<number> {
  if (sourceTypes.length === 0) {
    return 0;
  }

  return withSession(driver, async (session) => {
    const extraParams = { sourceTypes };
    await deleteChunksForUserMemoriesWhere(
      session,
      userId,
      MEMORY_SOURCE_TYPE_WHERE,
      extraParams,
    );
    await deleteMemoryEventsForUserMemoriesWhere(
      session,
      userId,
      MEMORY_SOURCE_TYPE_WHERE,
      extraParams,
    );
    await deleteProposalsForUserMemoriesWhere(
      session,
      userId,
      MEMORY_SOURCE_TYPE_WHERE,
      extraParams,
    );
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE ${MEMORY_SOURCE_TYPE_WHERE}
       DETACH DELETE m
       RETURN count(m) AS deleted`,
      { userId, sourceTypes },
    );
    await deleteOrphanTagsAndSources(session);
    return parseDeletedCount(result);
  });
}

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
    await deleteMemoryEventsForUserMemoriesWhere(session, userId, "true", {});
    await deleteProposalsForUserMemoriesWhere(session, userId, "true", {});
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
    return parseDeletedCount(result);
  });
}

export async function findMemoryByUrl(
  driver: Driver,
  userId: string,
  url: string,
): Promise<MemoryRef | null> {
  return findMemoryRef(driver, { userId, url });
}

async function incrementVisitCount(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<{ visitCount: number; lastVisitAt: string }> {
  const now = new Date().toISOString();
  const result = await driver.executeQuery(
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
    visitCount: neo4jInt(r, "visitCount"),
    lastVisitAt: String(neo4jGet(r, "lastVisitAt")),
  };
}

export async function shortCircuitOnDedupMatch(
  driver: Driver,
  userId: string,
  ref: MemoryRef | null,
): Promise<MemoryWithTags | null> {
  if (!ref) return null;
  await incrementVisitCount(driver, userId, ref.id);
  return getMemory(driver, userId, ref.id);
}

export async function findMemoryByTitleAndOrigin(
  driver: Driver,
  userId: string,
  title: string,
  origin: string,
): Promise<MemoryRef | null> {
  return findMemoryRef(
    driver,
    { userId, title },
    {
      extraWhere:
        "m.source IN ['browsing-history', 'bookmarks'] AND m.url STARTS WITH $origin",
      orderBy: "m.visitCount DESC, m.createdAt ASC",
      extraParams: { origin },
    },
  );
}

export async function findMemoryByContentHash(
  driver: Driver,
  userId: string,
  contentHash: string,
): Promise<MemoryRef | null> {
  return findMemoryRef(driver, { userId, contentHash });
}

export async function findMemoryByExternalId(
  driver: Driver,
  userId: string,
  sourceType: string,
  sourceId: string,
): Promise<MemoryRef | null> {
  return findMemoryRef(driver, { userId, sourceType, sourceId });
}

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
  const result = await driver.executeQuery(
    `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
     YIELD node AS m, score AS similarity
     WHERE m.userId = $userId
       AND ${visibleStatusClause("m", false)}
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
}
