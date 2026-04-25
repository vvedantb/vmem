import neo4j, {
  type Driver,
  type Integer,
  type Session,
  type Record as NeoRecord,
} from "neo4j-driver";
import Cypher from "@neo4j/cypher-builder";
import crypto from "node:crypto";
import { buildAndRun } from "./cypherHelpers";

type MemoryType = "profile" | "episodic" | "knowledge";
type MemoryStatus = "active" | "pinned" | "suppressed" | "expired";

interface MemoryNode {
  id: string;
  userId: string;
  profileId: string | null;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  confidence: number;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

interface MemoryWithTags extends MemoryNode {
  tags: string[];
}

interface MemorySnapshot {
  title: string;
  content: string;
  type: string;
  status: string;
  confidence: number;
  tags: string[];
}

interface MemoryEvent {
  id: string;
  action: string;
  actor: string;
  details: Record<string, string> | null;
  snapshot: MemorySnapshot | null;
  createdAt: string;
}

type ConnectionType = "tag" | "related";

interface TimelineEvent extends MemoryEvent {
  memoryId: string;
  memoryTitle: string;
  connectionType?: ConnectionType;
}

interface ScoreBreakdown {
  fulltext: number;
  // Semantic (vector) similarity from Neo4j cosine-distance search over
  // OpenAI-style embeddings. 0 when embeddings are unavailable (user has
  // no OPENROUTER_API_KEY set, or fulltext-only fallback is active).
  vector: number;
  recency: number;
  confidence: number;
}

interface MemoryCandidate extends MemoryWithTags {
  trace: {
    score: number;
    scoreBreakdown: ScoreBreakdown;
    reason: string;
  };
}

interface ProposedUpdateNode {
  id: string;
  memoryId: string;
  proposedContent: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
}

function parseJsonField<T>(val: string | null): T | null {
  if (val === null) return null;
  return JSON.parse(val) as T;
}

/**
 * Reciprocal Rank Fusion score. Rank is 1-indexed. The constant k=60 is
 * the value from Cormack et al. ("Reciprocal Rank Fusion outperforms
 * Condorcet and individual Rank Learning Methods", SIGIR '09) — it
 * dampens the contribution of high-rank results while keeping lower
 * ranks meaningful. RRF is robust to scale differences between fulltext
 * BM25 scores and cosine-similarity scores, which is why we use ranks
 * instead of the raw score numbers when combining the two legs.
 */
function rrfScore(rank: number, k = 60): number {
  return 1 / (k + rank);
}

/**
 * Age-in-days → recency multiplier. Small fixed buckets keep recent
 * knowledge (last week) near the top while not penalising older
 * reference memories too harshly.
 */
function recencyFromAgeDays(age: number): number {
  if (age < 1) return 1.0;
  if (age < 7) return 0.9;
  if (age < 30) return 0.7;
  if (age < 90) return 0.5;
  return 0.3;
}

/**
 * Narrow a raw Neo4j property value to `MemoryType | undefined`. Returns
 * undefined for nulls and any unrecognized string (future-proof against new
 * type values landing in the DB before the frontend knows about them).
 */
function toMemoryTypeOrUndefined(val: string | null): MemoryType | undefined {
  if (val === "profile" || val === "episodic" || val === "knowledge") {
    return val;
  }
  return undefined;
}

function toNeoInt(val: number | { toNumber(): number }): number {
  if (typeof val === "number") return val;
  return val.toNumber();
}

function toSnapshot(
  m: Pick<
    MemoryWithTags,
    "title" | "content" | "type" | "status" | "confidence" | "tags"
  >,
): string {
  return JSON.stringify({
    title: m.title,
    content: m.content,
    type: m.type,
    status: m.status,
    confidence: m.confidence,
    tags: m.tags,
  });
}

function toEventFromNode(props: {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  snapshot: string | null;
  details: string | null;
}): MemoryEvent {
  return {
    id: props.id,
    action: props.action,
    actor: props.actor,
    createdAt: props.createdAt,
    snapshot: parseJsonField<MemorySnapshot>(props.snapshot),
    details: parseJsonField<Record<string, string>>(props.details),
  };
}

function toMemoryWithTags(record: NeoRecord): MemoryWithTags {
  const obj = record.toObject();
  const props = obj.m.properties;
  return {
    id: props.id,
    userId: props.userId,
    profileId: props.profileId ?? null,
    title: props.title,
    content: props.content,
    type: props.type,
    source: props.source,
    confidence: props.confidence,
    status: props.status,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    expiresAt: props.expiresAt ?? null,
    tags: obj.tags ?? [],
  };
}

function toTimelineEvent(record: NeoRecord): TimelineEvent {
  return {
    ...toEventFromNode(record.get("e").properties),
    memoryId: String(record.get("memoryId") ?? ""),
    memoryTitle: String(record.get("memoryTitle") ?? ""),
  };
}

interface TagEdge {
  source: string;
  target: string;
  weight: number;
  sharedTags: string[];
}

/**
 * Parse a Neo4j record returned by the tag-edge Cypher query into a typed
 * TagEdge. The Cypher-side computation enforces:
 *   - Each pair appears once (m1.id < m2.id ordering).
 *   - weight >= 2 (at least two shared tags).
 *   - sharedTags capped at 5 via list slicing.
 *   - Popular tags with > 500 memories are pre-filtered out to prevent
 *     combinatorial explosion on blown-out tags like "misc".
 */
function toTagEdge(record: NeoRecord): TagEdge {
  const rawShared = record.get("sharedTags");
  const sharedTags = Array.isArray(rawShared)
    ? rawShared.filter(Boolean).map(String)
    : [];
  return {
    source: String(record.get("source")),
    target: String(record.get("target")),
    weight: toNeoInt(record.get("weight")),
    sharedTags,
  };
}

export class MemoryService {
  constructor(private driver: Driver) {}

  private async withSession<T>(
    fn: (session: Session) => Promise<T>,
  ): Promise<T> {
    const session = this.driver.session();
    try {
      return await fn(session);
    } finally {
      await session.close();
    }
  }

  async createMemory(params: {
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
  }): Promise<MemoryWithTags> {
    return this.withSession(async (session) => {
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
          tags: params.tags,
          now,
          expiresAt: params.expiresAt ?? null,
          url: params.url ?? null,
          embedding: params.embedding,
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

      await this.logEvent(
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

      // Create same-domain edge for URL-based memories (browsing history, bookmarks)
      if (params.url) {
        try {
          const domain = new URL(params.url).hostname;
          await session.run(
            `MATCH (m:Memory {id: $id})
             MATCH (m2:Memory {userId: $userId})
             WHERE m2.id <> $id
               AND m2.url IS NOT NULL
               AND m2.url STARTS WITH 'https://' + $domain
             WITH m, m2 LIMIT 10
             MERGE (m)-[r:RELATES_TO]->(m2)
             ON CREATE SET r.reason = 'same domain'`,
            {
              id,
              userId: params.userId,
              domain,
            },
          );
        } catch {
          // Invalid URL, skip domain edge creation
        }
      }

      const firstRecord = result.records[0];
      if (!firstRecord) throw new Error("Failed to create memory");
      return toMemoryWithTags(firstRecord);
    });
  }

  async findMemoryByUrl(
    userId: string,
    url: string,
  ): Promise<{ id: string; title: string; updatedAt: string } | null> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId, url: $url})
         WHERE m.status IN ['active', 'pinned']
         RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
         LIMIT 1`,
        { userId, url },
      );
      if (result.records.length === 0) return null;
      const r = result.records[0];
      if (!r) return null;
      return {
        id: String(r.get("id")),
        title: String(r.get("title")),
        updatedAt: String(r.get("updatedAt")),
      };
    });
  }

  /**
   * Increment visit count for an existing URL-based memory.
   * Called when a duplicate URL is detected during import.
   */
  async incrementVisitCount(
    userId: string,
    memoryId: string,
  ): Promise<{ visitCount: number; lastVisitAt: string }> {
    return this.withSession(async (session) => {
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
      const rawCount = r.get("visitCount");
      const visitCount =
        typeof rawCount === "object" &&
        rawCount !== null &&
        "toNumber" in rawCount
          ? (rawCount as { toNumber: () => number }).toNumber()
          : typeof rawCount === "number"
            ? rawCount
            : 1;
      return {
        visitCount,
        lastVisitAt: String(r.get("lastVisitAt")),
      };
    });
  }

  /**
   * Delete all "same session" RELATES_TO edges from batch import sources.
   * One-time cleanup migration for existing junk edges.
   */
  async deleteJunkSessionEdges(userId: string): Promise<number> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})-[r:RELATES_TO {reason: 'same session'}]->(m2:Memory)
         WHERE m.source IN ['browsing-history', 'bookmarks', 'google_drive', 'notion', 'onedrive', 'linear', 'gmail']
         DELETE r
         RETURN count(r) AS deleted`,
        { userId },
      );
      const r = result.records[0];
      if (!r) return 0;
      const raw = r.get("deleted");
      return typeof raw === "object" && raw !== null && "toNumber" in raw
        ? (raw as { toNumber: () => number }).toNumber()
        : typeof raw === "number"
          ? raw
          : 0;
    });
  }

  /**
   * Upsert a memory from an external source (Google Drive, Notion, etc.)
   * Uses MERGE on (userId, sourceType, sourceId) to avoid duplicates.
   * Creates new memory if not exists, updates content if exists.
   */
  async upsertFromSource(params: {
    userId: string;
    profileId: string;
    title: string;
    content: string;
    sourceType: string;
    sourceId: string;
    sourceUrl: string;
    // Pre-computed embedding vector. Applied on BOTH create and match — an
    // updated upstream document should refresh its semantic signal, not just
    // its text. Null ⇒ caller had no API key or embedding failed; memory
    // still upserts, backfill migration can repair later.
    embedding: number[] | null;
  }): Promise<{ id: string; created: boolean }> {
    return this.withSession(async (session) => {
      const now = new Date().toISOString();

      const result = await session.run(
        `MERGE (m:Memory {userId: $userId, sourceType: $sourceType, sourceId: $sourceId})
         ON CREATE SET
           m.id = $newId,
           m.profileId = $profileId,
           m.title = $title,
           m.content = $content,
           m.type = 'knowledge',
           m.source = $sourceType,
           m.confidence = 0.8,
           m.status = 'active',
           m.createdAt = $now,
           m.updatedAt = $now,
           m.sourceUrl = $sourceUrl,
           m.sourceSyncedAt = $now,
           m.embedding = $embedding
         ON MATCH SET
           m.title = $title,
           m.content = $content,
           m.updatedAt = $now,
           m.sourceUrl = $sourceUrl,
           m.sourceSyncedAt = $now,
           m.embedding = $embedding
         WITH m, m.createdAt = $now AS wasCreated
         MERGE (s:Source {name: $sourceType})
         MERGE (m)-[:FROM_SOURCE]->(s)
         RETURN m.id AS id, wasCreated`,
        {
          userId: params.userId,
          profileId: params.profileId,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          sourceUrl: params.sourceUrl,
          title: params.title,
          content: params.content,
          newId: crypto.randomUUID(),
          now,
          embedding: params.embedding,
        },
      );

      const firstRecord = result.records[0];
      if (!firstRecord) throw new Error("Failed to upsert memory from source");

      return {
        id: String(firstRecord.get("id")),
        created: Boolean(firstRecord.get("wasCreated")),
      };
    });
  }

  async getMemory(
    userId: string,
    memoryId: string,
  ): Promise<MemoryWithTags | null> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         RETURN m, collect(t.name) AS tags`,
        { memoryId, userId },
      );

      if (result.records.length === 0) return null;
      const firstRecord = result.records[0];
      if (!firstRecord) return null;
      return toMemoryWithTags(firstRecord);
    });
  }

  async listMemories(params: {
    userId: string;
    profileId?: string | null;
    type?: MemoryType;
    status?: MemoryStatus;
    source?: string;
    tags?: string[];
    searchQuery?: string;
    limit: number;
    offset: number;
  }): Promise<{ memories: MemoryWithTags[]; total: number }> {
    return this.withSession(async (session) => {
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
        whereClauses.push(
          "coalesce(m.status, 'active') IN ['active', 'pinned']",
        );
      }
      if (params.source) {
        whereClauses.push("m.source = $source");
        queryParams.source = params.source;
      }

      const where = whereClauses.join(" AND ");

      const hasTagFilter = !!params.tags && params.tags.length > 0;
      if (hasTagFilter && params.tags) {
        queryParams.filterTags = params.tags;
      }
      const filterTagsCount = params.tags?.length ?? 0;

      const trimmedQuery = params.searchQuery?.trim() ?? "";
      const hasSearchQuery = trimmedQuery.length > 0;
      if (hasSearchQuery) {
        queryParams.searchQuery = trimmedQuery;
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
      const total = countRecord ? toNeoInt(countRecord.get("total")) : 0;

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

  async updateMemory(
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
    return this.withSession(async (session) => {
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
        setParams.push([
          m.property("status"),
          new Cypher.Param(updates.status),
        ]);
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

      const tagUpdate =
        updates.tags !== undefined
          ? new Cypher.Raw(() => [
              `WITH m
OPTIONAL MATCH (m)-[r:TAGGED_WITH]->(:Tag)
DELETE r
WITH m
UNWIND $newTags AS tagName
MERGE (tag:Tag {name: tagName})
CREATE (m)-[:TAGGED_WITH]->(tag)`,
              { newTags: updates.tags },
            ])
          : undefined;

      const returnPart = new Cypher.With(m)
        .optionalMatch(
          new Cypher.Pattern(m)
            .related({ type: "TAGGED_WITH", direction: "right" })
            .to(t, { labels: ["Tag"] }),
        )
        .return(m, [Cypher.collect(t.property("name")), "tags"]);

      const query = Cypher.utils.concat(matchWithSet, tagUpdate, returnPart);
      const result = await buildAndRun(session, query);

      if (result.records.length === 0) return null;

      const firstRecord = result.records[0];
      if (!firstRecord) return null;
      const updated = toMemoryWithTags(firstRecord);
      await this.logEvent(
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

  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         DETACH DELETE m
         RETURN count(m) AS deleted`,
        { memoryId, userId },
      );
      const firstRecord = result.records[0];
      if (!firstRecord) return false;
      return toNeoInt(firstRecord.get("deleted")) > 0;
    });
  }

  async searchMemories(params: {
    userId: string;
    profileId?: string | null;
    query?: string;
    type?: MemoryType;
    tags?: string[];
    source?: string;
    limit: number;
    offset: number;
  }): Promise<{ memories: MemoryWithTags[]; total: number }> {
    // Thin wrapper around listMemories. Keeps the public action surface stable
    // for callers (MCP tools, CommandPalette) while funnelling every filter
    // (profile, type, status, tags, source, fulltext) through the single
    // Cypher path. Fixes the old bugs where search ignored type/status/tag
    // filters and returned total = page.length.
    return this.listMemories({
      userId: params.userId,
      profileId: params.profileId,
      type: params.type,
      tags: params.tags,
      source: params.source,
      searchQuery: params.query,
      limit: params.limit,
      offset: params.offset,
    });
  }

  /**
   * Hybrid retrieval: fulltext (BM25) + vector (cosine) fused with
   * Reciprocal Rank Fusion, then weighted by recency and confidence.
   *
   * Two legs run sequentially on a single session (per Neo4j driver
   * guidance — never parallel `session.run` on the same session). The
   * vector leg is skipped when `queryEmbedding` is null, in which case
   * the function degrades to fulltext-only scoring with the same
   * weights — old behaviour preserved for users without an API key.
   *
   * RRF replaces the raw `fulltextScore` term from the old formula:
   *   total = rrfCombined * 0.5 + recency * 0.25 + confidence * 0.25
   *
   * Each leg over-fetches `limit * 2` so the merge has room to rerank.
   */
  async retrieveMemories(params: {
    userId: string;
    profileId?: string | null;
    query: string;
    /** Pre-computed query embedding. Null ⇒ skip vector leg. */
    queryEmbedding: number[] | null;
    type?: MemoryType;
    tags?: string[];
    limit: number;
  }): Promise<MemoryCandidate[]> {
    return this.withSession(async (session) => {
      const profileFilter =
        params.profileId !== undefined && params.profileId !== null
          ? "AND (m.profileId = $profileId OR m.profileId IS NULL)"
          : "";

      const legLimit = params.limit * 2;

      // Leg 1: fulltext (keyword) search.
      const ftResult = await session.run(
        `CALL db.index.fulltext.queryNodes('memory_content', $query)
         YIELD node AS m, score AS fulltextScore
         WHERE m.userId = $userId ${profileFilter}
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         WITH m, collect(t.name) AS tags, fulltextScore,
              duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
         RETURN m, tags, fulltextScore, ageInDays
         ORDER BY fulltextScore DESC
         LIMIT $legLimit`,
        {
          query: params.query,
          userId: params.userId,
          profileId: params.profileId ?? null,
          legLimit: neo4j.int(legLimit),
        },
      );

      // Leg 2: vector (semantic) search — only when we have an embedding.
      // db.index.vector.queryNodes takes (indexName, k, vector) and returns
      // at most k results ordered by cosine similarity DESC.
      const vecResult = params.queryEmbedding
        ? await session.run(
            `CALL db.index.vector.queryNodes('memory_embedding', $k, $queryVector)
             YIELD node AS m, score AS vectorScore
             WHERE m.userId = $userId ${profileFilter}
             OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
             WITH m, collect(t.name) AS tags, vectorScore,
                  duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
             RETURN m, tags, vectorScore, ageInDays
             ORDER BY vectorScore DESC`,
            {
              k: neo4j.int(legLimit),
              queryVector: params.queryEmbedding,
              userId: params.userId,
              profileId: params.profileId ?? null,
            },
          )
        : null;

      // Merge by memory id. Each entry holds enough state to compute RRF
      // plus the final weighted score and the reason-string inputs.
      interface MergedEntry {
        memory: MemoryWithTags;
        fulltextScore: number;
        vectorScore: number;
        recencyScore: number;
        confidenceScore: number;
        ftRank: number | null;
        vecRank: number | null;
      }
      const merged = new Map<string, MergedEntry>();

      ftResult.records.forEach((record, idx) => {
        const memory = toMemoryWithTags(record);
        const fulltextScore = Number(record.get("fulltextScore"));
        const ageInDays = toNeoInt(record.get("ageInDays"));
        merged.set(memory.id, {
          memory,
          fulltextScore,
          vectorScore: 0,
          recencyScore: recencyFromAgeDays(ageInDays),
          confidenceScore: memory.confidence,
          ftRank: idx + 1,
          vecRank: null,
        });
      });

      if (vecResult) {
        vecResult.records.forEach((record, idx) => {
          const memory = toMemoryWithTags(record);
          const vectorScore = Number(record.get("vectorScore"));
          const ageInDays = toNeoInt(record.get("ageInDays"));
          const existing = merged.get(memory.id);
          if (existing) {
            existing.vectorScore = vectorScore;
            existing.vecRank = idx + 1;
          } else {
            merged.set(memory.id, {
              memory,
              fulltextScore: 0,
              vectorScore,
              recencyScore: recencyFromAgeDays(ageInDays),
              confidenceScore: memory.confidence,
              ftRank: null,
              vecRank: idx + 1,
            });
          }
        });
      }

      const candidates: MemoryCandidate[] = Array.from(merged.values()).map(
        (entry) => {
          const rrfCombined =
            (entry.ftRank === null ? 0 : rrfScore(entry.ftRank)) +
            (entry.vecRank === null ? 0 : rrfScore(entry.vecRank));
          const totalScore =
            rrfCombined * 0.5 +
            entry.recencyScore * 0.25 +
            entry.confidenceScore * 0.25;

          const reasons: string[] = [];
          // "Both" is strictly stronger than either single-signal reason;
          // emit it alone when it applies.
          if (entry.fulltextScore > 0.5 && entry.vectorScore > 0.5) {
            reasons.push("matched both keywords and meaning");
          } else if (entry.vectorScore > 0.7) {
            reasons.push("strong semantic match");
          } else if (entry.fulltextScore > 0.5) {
            reasons.push("strong content match");
          }
          if (entry.recencyScore > 0.8) reasons.push("recently created");
          if (entry.confidenceScore > 0.8)
            reasons.push("high confidence source");
          if (entry.memory.status === "pinned") reasons.push("pinned by user");
          if (params.queryEmbedding === null) {
            reasons.push(
              "semantic search unavailable — set OPENROUTER_API_KEY",
            );
          }

          return {
            ...entry.memory,
            trace: {
              score: totalScore,
              scoreBreakdown: {
                fulltext: entry.fulltextScore,
                vector: entry.vectorScore,
                recency: entry.recencyScore,
                confidence: entry.confidenceScore,
              },
              reason:
                reasons.length > 0
                  ? `Matched because: ${reasons.join(", ")}`
                  : "Weak match across all signals",
            },
          };
        },
      );

      candidates.sort((a, b) => b.trace.score - a.trace.score);
      return candidates.slice(0, params.limit);
    });
  }

  async getMemoryEvents(
    userId: string,
    memoryId: string,
  ): Promise<MemoryEvent[]> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})<-[:EVENT_FOR]-(e:MemoryEvent)
         RETURN e
         ORDER BY e.createdAt DESC`,
        { memoryId, userId },
      );

      return result.records.map((record) =>
        toEventFromNode(record.get("e").properties),
      );
    });
  }

  async createProposedUpdate(params: {
    memoryId: string;
    proposedContent: string;
    reason: string;
  }): Promise<ProposedUpdateNode> {
    return this.withSession(async (session) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId})
         CREATE (p:ProposedUpdate {
           id: $id,
           memoryId: $memoryId,
           proposedContent: $proposedContent,
           reason: $reason,
           status: 'pending',
           createdAt: $now,
           resolvedAt: null
         })
         CREATE (p)-[:UPDATE_FOR]->(m)
         RETURN p`,
        {
          id,
          memoryId: params.memoryId,
          proposedContent: params.proposedContent,
          reason: params.reason,
          now,
        },
      );

      const firstRecord = result.records[0];
      if (!firstRecord) throw new Error("Failed to create proposed update");
      const props = firstRecord.get("p").properties;
      return {
        id: props.id,
        memoryId: props.memoryId,
        proposedContent: props.proposedContent,
        reason: props.reason,
        status: props.status,
        createdAt: props.createdAt,
        resolvedAt: null,
      };
    });
  }

  async listProposedUpdates(userId: string): Promise<ProposedUpdateNode[]> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (p:ProposedUpdate {status: 'pending'})-[:UPDATE_FOR]->(m:Memory {userId: $userId})
         RETURN p
         ORDER BY p.createdAt DESC`,
        { userId },
      );

      return result.records.map((record) => {
        const props = record.get("p").properties;
        return {
          id: props.id,
          memoryId: props.memoryId,
          proposedContent: props.proposedContent,
          reason: props.reason,
          status: props.status,
          createdAt: props.createdAt,
          resolvedAt: props.resolvedAt ?? null,
        };
      });
    });
  }

  async resolveProposal(
    proposalId: string,
    action: "approve" | "reject",
  ): Promise<{ status: string; memoryId: string } | null> {
    return this.withSession(async (session) => {
      const now = new Date().toISOString();

      if (action === "approve") {
        const result = await session.run(
          `MATCH (p:ProposedUpdate {id: $proposalId})-[:UPDATE_FOR]->(m:Memory)
           SET p.status = 'approved', p.resolvedAt = $now,
               m.content = p.proposedContent, m.updatedAt = $now
           WITH p, m
           OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
           RETURN p.status AS status, m, collect(t.name) AS tags`,
          { proposalId, now },
        );

        if (result.records.length === 0) return null;
        const firstRecord = result.records[0];
        if (!firstRecord) return null;
        const memory = toMemoryWithTags(firstRecord);

        await this.logEvent(
          session,
          memory.id,
          "proposal_approved",
          "api",
          {},
          toSnapshot(memory),
        );

        return {
          status: String(firstRecord.get("status")),
          memoryId: memory.id,
        };
      }

      const result = await session.run(
        `MATCH (p:ProposedUpdate {id: $proposalId})-[:UPDATE_FOR]->(m:Memory)
         SET p.status = 'rejected', p.resolvedAt = $now
         RETURN p.status AS status, m.id AS memoryId`,
        { proposalId, now },
      );

      if (result.records.length === 0) return null;
      const record = result.records[0];
      if (!record) return null;
      const memoryId = String(record.get("memoryId"));

      await this.logEvent(
        session,
        memoryId,
        "proposal_rejected",
        "api",
        {},
        null,
      );

      return {
        status: String(record.get("status")),
        memoryId,
      };
    });
  }

  async getStats(
    userId: string,
    profileId?: string | null,
  ): Promise<{
    totalMemories: number;
    memoriesThisWeek: number;
    memoriesThisMonth: number;
    memoriesAddedToday: number;
    totalTags: number;
    growthData: { date: string; total: number; new: number }[];
  }> {
    return this.withSession(async (session) => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).toISOString();

      // Build profile filter
      const profileFilter =
        profileId !== undefined && profileId !== null
          ? "AND (m.profileId = $profileId OR m.profileId IS NULL)"
          : "";

      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE true ${profileFilter}
         WITH count(m) AS total,
              count(CASE WHEN m.createdAt >= $weekAgo THEN 1 END) AS thisWeek,
              count(CASE WHEN m.createdAt >= $monthAgo THEN 1 END) AS thisMonth,
              count(CASE WHEN m.createdAt >= $todayStart THEN 1 END) AS today
         OPTIONAL MATCH (t:Tag)<-[:TAGGED_WITH]-(m2:Memory {userId: $userId})
         WHERE true ${profileFilter.replace(/m\./g, "m2.")}
         WITH total, thisWeek, thisMonth, today, count(DISTINCT t) AS tagCount
         RETURN total, thisWeek, thisMonth, today, tagCount`,
        {
          userId,
          profileId: profileId ?? null,
          weekAgo: weekAgo.toISOString(),
          monthAgo: monthAgo.toISOString(),
          todayStart,
        },
      );

      let totalMemories = 0;
      let memoriesThisWeek = 0;
      let memoriesThisMonth = 0;
      let memoriesAddedToday = 0;
      let totalTags = 0;

      if (result.records.length > 0) {
        const record = result.records[0];
        if (record) {
          totalMemories = toNeoInt(record.get("total"));
          memoriesThisWeek = toNeoInt(record.get("thisWeek"));
          memoriesThisMonth = toNeoInt(record.get("thisMonth"));
          memoriesAddedToday = toNeoInt(record.get("today"));
          totalTags = toNeoInt(record.get("tagCount"));
        }
      }

      // Growth data: old implementation ran OPTIONAL MATCH twice per day in a
      // 7-day UNWIND, doing O(7×n) scans to recompute the cumulative total for
      // each day. Historical per-day totals never change, so replace with:
      //   1. A single baseline count of memories created before the window.
      //   2. A single bucketed aggregate of daily counts within the window.
      // Cumulative totals are then computed in JS by walking the 7 days in
      // order, adding each daily delta onto the running baseline.
      const growthProfileFilter =
        profileId !== undefined && profileId !== null
          ? "AND (m.profileId = $profileId OR m.profileId IS NULL)"
          : "";

      const baselineResult = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE date(datetime(m.createdAt)) < date() - duration({days: 6}) ${growthProfileFilter}
         RETURN count(m) AS baseline`,
        { userId, profileId: profileId ?? null },
      );
      const baselineRecord = baselineResult.records[0];
      const baseline = baselineRecord
        ? toNeoInt(baselineRecord.get("baseline"))
        : 0;

      const dailyResult = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE date(datetime(m.createdAt)) >= date() - duration({days: 6})
           AND date(datetime(m.createdAt)) <= date() ${growthProfileFilter}
         RETURN toString(date(datetime(m.createdAt))) AS day, count(*) AS newCount`,
        { userId, profileId: profileId ?? null },
      );

      const dailyCounts = new Map<string, number>();
      for (const rec of dailyResult.records) {
        dailyCounts.set(String(rec.get("day")), toNeoInt(rec.get("newCount")));
      }

      // Walk the 7-day window in ascending order, accumulating the running
      // total. `todayMs` anchors to midnight local-day so we can derive the
      // ISO yyyy-mm-dd key matching Cypher's `date()` output.
      const today = new Date();
      const todayMs = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      let running = baseline;
      const growthData: { date: string; total: number; new: number }[] = [];
      for (let offset = 6; offset >= 0; offset--) {
        const dayDate = new Date(todayMs - offset * dayMs);
        const isoDay = dayDate.toISOString().slice(0, 10);
        const newCount = dailyCounts.get(isoDay) ?? 0;
        running += newCount;
        growthData.push({
          date: dayDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          total: running,
          new: newCount,
        });
      }

      return {
        totalMemories,
        memoriesThisWeek,
        memoriesThisMonth,
        memoriesAddedToday,
        totalTags,
        growthData,
      };
    });
  }

  async getRecentActivity(
    userId: string,
    profileId?: string | null,
    limit = 10,
  ): Promise<
    {
      id: string;
      type: string;
      title: string;
      description: string;
      timestamp: string;
      relativeTime: string;
    }[]
  > {
    return this.withSession(async (session) => {
      const profileFilter =
        profileId !== undefined && profileId !== null
          ? "AND (m.profileId = $profileId OR m.profileId IS NULL)"
          : "";

      const result = await session.run(
        `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
         WHERE true ${profileFilter}
         RETURN e, m.title AS memoryTitle
         ORDER BY e.createdAt DESC
         LIMIT $limit`,
        { userId, profileId: profileId ?? null, limit: neo4j.int(limit) },
      );

      const now = Date.now();
      return result.records.map((record) => {
        const props = record.get("e").properties;
        const memoryTitle = String(
          props.memoryTitle ?? record.get("memoryTitle"),
        );
        const action = String(props.action);
        const createdAt = String(props.createdAt);
        const diffMs = now - new Date(createdAt).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let relativeTime: string;
        if (diffMins < 1) relativeTime = "just now";
        else if (diffMins < 60) relativeTime = `${diffMins}m ago`;
        else if (diffHours < 24) relativeTime = `${diffHours}h ago`;
        else relativeTime = `${diffDays}d ago`;

        const typeMap: Record<string, string> = {
          created: "memory_created",
          updated: "memory_updated",
          deleted: "memory_deleted",
        };

        const descMap: Record<string, string> = {
          created: `Created "${memoryTitle}"`,
          updated: `Updated "${memoryTitle}"`,
          deleted: `Deleted "${memoryTitle}"`,
        };

        return {
          id: String(props.id),
          type: typeMap[action] ?? action,
          title: "Memory",
          description: descMap[action] ?? `${action} "${memoryTitle}"`,
          timestamp: createdAt,
          relativeTime,
        };
      });
    });
  }

  async getMemoryTimeline(
    userId: string,
    memoryId: string,
  ): Promise<TimelineEvent[]> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {id: $memoryId, userId: $userId})
         RETURN e, m.id AS memoryId, m.title AS memoryTitle
         ORDER BY e.createdAt ASC`,
        { memoryId, userId },
      );

      return result.records.map(toTimelineEvent);
    });
  }

  async getTopicTimeline(
    userId: string,
    tag: string,
    limit: number,
    offset: number,
  ): Promise<TimelineEvent[]> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (tagMatched:Memory {userId: $userId})-[:TAGGED_WITH]->(t:Tag {name: $tag})
         WITH collect(DISTINCT tagMatched) AS tagMemories
         UNWIND tagMemories AS tm
         OPTIONAL MATCH (tm)-[:RELATES_TO]-(related:Memory {userId: $userId})
         WITH tagMemories, collect(DISTINCT related) AS relatedMemories
         WITH tagMemories, [r IN relatedMemories WHERE r IS NOT NULL AND NOT r IN tagMemories] AS onlyRelated
         WITH tagMemories + onlyRelated AS allMemories, tagMemories
         UNWIND allMemories AS mem
         WITH DISTINCT mem, mem IN tagMemories AS isTagMatch
         MATCH (e:MemoryEvent)-[:EVENT_FOR]->(mem)
         RETURN e, mem.id AS memoryId, mem.title AS memoryTitle,
                CASE WHEN isTagMatch THEN 'tag' ELSE 'related' END AS connectionType
         ORDER BY e.createdAt ASC
         SKIP $offset LIMIT $limit`,
        {
          userId,
          tag,
          offset: neo4j.int(offset),
          limit: neo4j.int(limit),
        },
      );

      return result.records.map((record) => {
        const connType = String(record.get("connectionType") ?? "");
        const connectionType: ConnectionType =
          connType === "related" ? "related" : "tag";
        return { ...toTimelineEvent(record), connectionType };
      });
    });
  }

  async getSearchTimeline(
    userId: string,
    query: string,
    limit: number,
    offset: number,
  ): Promise<TimelineEvent[]> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `CALL db.index.fulltext.queryNodes('memory_content', $query)
         YIELD node AS m, score
         WHERE m.userId = $userId
         MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m)
         RETURN e, m.id AS memoryId, m.title AS memoryTitle
         ORDER BY e.createdAt ASC
         SKIP $offset LIMIT $limit`,
        {
          query,
          userId,
          offset: neo4j.int(offset),
          limit: neo4j.int(limit),
        },
      );

      return result.records.map(toTimelineEvent);
    });
  }

  async linkMemories(
    userId: string,
    memoryIdA: string,
    memoryIdB: string,
    reason: string,
  ): Promise<boolean> {
    if (memoryIdA === memoryIdB) return false;
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (a:Memory {id: $memoryIdA, userId: $userId}), (b:Memory {id: $memoryIdB, userId: $userId})
         MERGE (a)-[r:RELATES_TO]->(b)
         SET r.reason = $reason
         RETURN a, b`,
        { memoryIdA, memoryIdB, userId, reason },
      );
      return result.records.length > 0;
    });
  }

  async unlinkMemories(
    userId: string,
    memoryIdA: string,
    memoryIdB: string,
  ): Promise<boolean> {
    return this.withSession(async (session) => {
      await session.run(
        `MATCH (a:Memory {id: $memoryIdA, userId: $userId})-[r:RELATES_TO]-(b:Memory {id: $memoryIdB, userId: $userId})
         DELETE r`,
        { memoryIdA, memoryIdB, userId },
      );
      return true;
    });
  }

  async getRelatedMemories(
    userId: string,
    memoryId: string,
  ): Promise<{ memory: MemoryWithTags; reason: string }[]> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})-[r:RELATES_TO]-(related:Memory)
         OPTIONAL MATCH (related)-[:TAGGED_WITH]->(t:Tag)
         RETURN related AS m, collect(DISTINCT t.name) AS tags, r.reason AS reason`,
        { memoryId, userId },
      );
      return result.records.map((record) => ({
        memory: toMemoryWithTags(record),
        reason: String(record.get("reason") ?? ""),
      }));
    });
  }

  async getAllRelationships(
    userId: string,
    limit = 500,
  ): Promise<{ source: string; target: string; reason: string }[]> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (a:Memory {userId: $userId})-[r:RELATES_TO]->(b:Memory)
         RETURN a.id AS source, b.id AS target, r.reason AS reason
         LIMIT $limit`,
        { userId, limit: neo4j.int(limit) },
      );

      return result.records.map((record) => ({
        source: String(record.get("source") ?? ""),
        target: String(record.get("target") ?? ""),
        reason: String(record.get("reason") ?? ""),
      }));
    });
  }

  async getGraphData(
    userId: string,
    profileId?: string | null,
  ): Promise<{
    nodes: {
      id: string;
      title: string;
      tags: string[];
      createdAt: string;
      source?: string;
      sourceType: string | null;
      type?: MemoryType;
    }[];
    relatesToEdges: { source: string; target: string; reason: string }[];
    tagEdges: TagEdge[];
  }> {
    // Two parallel sessions:
    //   1. Combined nodes + RELATES_TO edges in a single round-trip. Nodes
    //      are bounded to the 2000 most recent active/pinned memories via
    //      ORDER BY + LIMIT pushed into the MATCH — the composite index
    //      memory_user_status_created lets the planner satisfy both the
    //      WHERE and the ORDER BY with a single index seek (no Sort op).
    //      RELATES_TO is then scoped to just those 2000 node IDs, so the
    //      edge scan is O(edges_in_subgraph) instead of O(all_user_edges).
    //   2. Tag-shared edges, separately because it scans a different index
    //      path and can run independently. (Driver rule: never run
    //      concurrent .run() on the same Session, so parallelism still
    //      needs separate sessions.)
    //
    // Note: `content` is deliberately NOT returned here. The graph canvas
    // doesn't render content inline — it's only shown in hover tooltips and
    // the detail side panel, which now fetch it on demand via getMemoryContent.
    // Dropping content cuts the wire payload roughly in half at 2k memories.
    const nodesEdgesSession = this.driver.session();
    const tagEdgesSession = this.driver.session();

    const profileFilter =
      profileId !== undefined && profileId !== null
        ? "AND (m.profileId = $profileId OR m.profileId IS NULL)"
        : "";

    try {
      const [nodesEdgesResult, tagEdgesResult] = await Promise.all([
        // Single-round-trip query. The first CALL collects the top-2000
        // nodes and their IDs in one pass; the second CALL takes those
        // nodeIds and pulls RELATES_TO edges scoped to that set. The outer
        // RETURN emits exactly one row containing both lists.
        nodesEdgesSession.run(
          `CALL () {
             MATCH (m:Memory {userId: $userId})
             WHERE coalesce(m.status, 'active') IN ['active', 'pinned'] ${profileFilter}
             WITH m ORDER BY m.createdAt DESC LIMIT 2000
             OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
             WITH m, collect(t.name) AS memTags
             RETURN collect({
               id: m.id, title: m.title, tags: memTags,
               createdAt: m.createdAt, source: m.source,
               type: m.type, sourceType: m.sourceType
             }) AS nodes,
             collect(m.id) AS nodeIds
           }
           CALL (nodeIds) {
             MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
             WHERE a.id IN nodeIds AND b.id IN nodeIds
             RETURN collect({source: a.id, target: b.id, reason: r.reason}) AS relatesToEdges
           }
           RETURN nodes, relatesToEdges`,
          { userId, profileId: profileId ?? null },
        ),
        // Tag-edges. Seed MATCH gathers each tag's memory list once,
        // applies the [2, 500] cardinality gate, then generates pairs
        // by unwinding the per-tag list against itself. That caps the
        // cartesian at 500×500 per tag (already small) instead of letting
        // the planner rescan Memory twice. Profile/status filtering is
        // applied once in the seed MATCH, not per-pair.
        tagEdgesSession.run(
          `MATCH (m:Memory {userId: $userId})-[:TAGGED_WITH]->(t:Tag)
           WHERE coalesce(m.status, 'active') IN ['active', 'pinned'] ${profileFilter}
           WITH t, collect(m) AS memsForTag, count(*) AS userTagCount
           WHERE userTagCount >= 2 AND userTagCount <= 500
           UNWIND memsForTag AS m1
           UNWIND memsForTag AS m2
           WITH m1, m2, t WHERE m1.id < m2.id
           WITH m1, m2, collect(DISTINCT t.name) AS sharedTagsAll
           WITH m1, m2, sharedTagsAll, size(sharedTagsAll) AS weight
           WHERE weight >= 2
           RETURN m1.id AS source, m2.id AS target, weight,
                  sharedTagsAll[..5] AS sharedTags
           ORDER BY weight DESC
           LIMIT 5000`,
          { userId, profileId: profileId ?? null },
        ),
      ]);

      const combinedRow = nodesEdgesResult.records[0];
      const rawNodes = combinedRow ? combinedRow.get("nodes") : [];
      const rawEdges = combinedRow ? combinedRow.get("relatesToEdges") : [];

      const nodes = (Array.isArray(rawNodes) ? rawNodes : []).map((n) => ({
        id: String(n.id),
        title: String(n.title),
        tags: Array.isArray(n.tags) ? n.tags.filter(Boolean).map(String) : [],
        createdAt: String(n.createdAt),
        source: n.source !== null ? String(n.source) : undefined,
        sourceType: n.sourceType !== null ? String(n.sourceType) : null,
        type: toMemoryTypeOrUndefined(n.type),
      }));

      const relatesToEdges = (Array.isArray(rawEdges) ? rawEdges : []).map(
        (e) => ({
          source: String(e.source),
          target: String(e.target),
          reason: String(e.reason ?? ""),
        }),
      );

      const tagEdges = tagEdgesResult.records.map(toTagEdge);

      return { nodes, relatesToEdges, tagEdges };
    } finally {
      await Promise.all([nodesEdgesSession.close(), tagEdgesSession.close()]);
    }
  }

  /**
   * Fetch the `content` (body text) of a single memory on-demand. Used by
   * the graph view for lazy-loading — the graph listing query omits content
   * to keep the payload under ~500KB, and this action is called when the
   * user hovers or clicks a node. Scoped by userId so a user can never read
   * another user's memory content.
   */
  async getMemoryContent(userId: string, memoryId: string): Promise<string> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         RETURN m.content AS content`,
        { userId, memoryId },
      );
      const first = result.records[0];
      if (!first) return "";
      const value = first.get("content");
      return typeof value === "string" ? value : "";
    });
  }

  async getLocalGraph(
    userId: string,
    focusId: string,
    profileId?: string | null,
  ): Promise<ReturnType<MemoryService["getGraphData"]>> {
    const nodesSession = this.driver.session();
    let nodeIds: string[];
    // Mirrors getGraphData: content is NOT part of the graph payload. The
    // frontend fetches it on demand via getMemoryContent when the user
    // hovers or opens the detail panel.
    let nodes: {
      id: string;
      title: string;
      tags: string[];
      createdAt: string;
      source?: string;
      sourceType: string | null;
      type?: MemoryType;
    }[];

    const profileFilterFocus =
      profileId !== undefined && profileId !== null
        ? "AND (focus.profileId = $profileId OR focus.profileId IS NULL)"
        : "";
    // QPP inline filter on the traversal node. Keeps the suppressed/wrong-
    // user nodes from expanding at all, rather than expanding and discarding.
    const profileFilterB =
      profileId !== undefined && profileId !== null
        ? "AND (b.profileId = $profileId OR b.profileId IS NULL)"
        : "";

    try {
      // Quantified Path Pattern replaces the old [:RELATES_TO*1..2] form.
      // QPP filters each hop inline, so the planner stops expansion early at
      // suppressed or wrong-user nodes instead of traversing then discarding.
      // The grouping is made explicit with a WITH clause before RETURN so
      // aggregation keys are unambiguous.
      const nodesResult = await nodesSession.run(
        `MATCH (focus:Memory {id: $focusId, userId: $userId})
         WHERE coalesce(focus.status, 'active') IN ['active', 'pinned'] ${profileFilterFocus}
         OPTIONAL MATCH (focus)
           ((a:Memory WHERE coalesce(a.status, 'active') IN ['active', 'pinned'])
            -[:RELATES_TO]-
            (b:Memory WHERE coalesce(b.status, 'active') IN ['active', 'pinned']
               AND b.userId = $userId
               ${profileFilterB})
           ){1,2}
           (neighbor:Memory)
         WITH focus, collect(DISTINCT neighbor) AS neighbors
         WITH [focus] + neighbors AS allNodes
         UNWIND allNodes AS m
         WITH DISTINCT m LIMIT 500
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         WITH m, collect(t.name) AS tags
         RETURN m.id AS id, m.title AS title,
                tags, m.createdAt AS createdAt,
                m.source AS source, m.type AS type,
                m.sourceType AS sourceType`,
        { userId, focusId, profileId: profileId ?? null },
      );

      nodes = nodesResult.records.map((r) => ({
        id: String(r.get("id")),
        title: String(r.get("title")),
        tags: Array.isArray(r.get("tags"))
          ? r.get("tags").filter(Boolean).map(String)
          : [],
        createdAt: String(r.get("createdAt")),
        source: r.get("source") !== null ? String(r.get("source")) : undefined,
        sourceType:
          r.get("sourceType") !== null ? String(r.get("sourceType")) : null,
        type: toMemoryTypeOrUndefined(r.get("type")),
      }));
      nodeIds = nodes.map((n) => n.id);
    } finally {
      await nodesSession.close();
    }

    if (nodeIds.length === 0) {
      return { nodes: [], relatesToEdges: [], tagEdges: [] };
    }

    // Edges scoped to the local neighbourhood: both RELATES_TO edges between
    // resolved nodes and tag-shared edges are computed in Cypher in parallel.
    const relatesToSession = this.driver.session();
    const tagEdgesSession = this.driver.session();
    try {
      const [relatesToResult, tagEdgesResult] = await Promise.all([
        relatesToSession.run(
          `MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
           WHERE a.id IN $nodeIds AND b.id IN $nodeIds
           RETURN a.id AS source, b.id AS target, r.reason AS reason`,
          { nodeIds },
        ),
        tagEdgesSession.run(
          // No popular-tag pre-filter needed here — the node set is already
          // bounded by the focus neighbourhood (LIMIT 500 upstream), so the
          // pair cartesian is always small.
          `MATCH (m1:Memory)-[:TAGGED_WITH]->(t:Tag)<-[:TAGGED_WITH]-(m2:Memory)
           WHERE m1.id IN $nodeIds AND m2.id IN $nodeIds AND m1.id < m2.id
           WITH m1, m2, collect(DISTINCT t.name) AS sharedTagsAll
           WITH m1, m2, sharedTagsAll, size(sharedTagsAll) AS weight
           WHERE weight >= 2
           RETURN m1.id AS source, m2.id AS target, weight,
                  sharedTagsAll[..5] AS sharedTags
           ORDER BY weight DESC
           LIMIT 2000`,
          { nodeIds },
        ),
      ]);

      const relatesToEdges = relatesToResult.records.map((r) => ({
        source: String(r.get("source")),
        target: String(r.get("target")),
        reason: String(r.get("reason") ?? ""),
      }));

      const tagEdges = tagEdgesResult.records.map(toTagEdge);

      return { nodes, relatesToEdges, tagEdges };
    } finally {
      await Promise.all([relatesToSession.close(), tagEdgesSession.close()]);
    }
  }

  async getRecentMemoryTitles(
    userId: string,
    excludeId: string,
    limit = 30,
  ): Promise<Array<{ id: string; title: string }>> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE m.id <> $excludeId AND m.status IN ['active', 'pinned']
         RETURN m.id AS id, m.title AS title
         ORDER BY m.updatedAt DESC
         LIMIT $limit`,
        { userId, excludeId, limit: neo4j.int(limit) },
      );
      return result.records.map((r) => ({
        id: String(r.get("id")),
        title: String(r.get("title")),
      }));
    });
  }

  async applyEnrichment(
    memoryId: string,
    userId: string,
    tags: string[],
    relatedIds: string[],
  ): Promise<void> {
    return this.withSession(async (session) => {
      const tx = session.beginTransaction();
      try {
        await tx.run(
          `MATCH (m:Memory {id: $memoryId, userId: $userId})
           OPTIONAL MATCH (m)-[r:TAGGED_WITH]->(:Tag)
           DELETE r
           WITH m
           FOREACH (tagName IN $tags |
             MERGE (t:Tag {name: tagName})
             MERGE (m)-[:TAGGED_WITH]->(t)
           )`,
          { memoryId, userId, tags },
        );

        await tx.run(
          `MATCH (m:Memory {id: $memoryId, userId: $userId})
           OPTIONAL MATCH (m)-[r:RELATES_TO]-()
           WHERE r.reason = 'content similarity'
           DELETE r`,
          { memoryId, userId },
        );

        if (relatedIds.length > 0) {
          await tx.run(
            `MATCH (m:Memory {id: $memoryId, userId: $userId})
             UNWIND $relatedIds AS relId
             MATCH (m2:Memory {id: relId, userId: $userId})
             MERGE (m)-[r:RELATES_TO]->(m2)
             ON CREATE SET r.reason = 'content similarity'`,
            { memoryId, userId, relatedIds },
          );
        }

        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    });
  }

  private async logEvent(
    session: Session,
    memoryId: string,
    action: string,
    actor: string,
    details: Record<string, string>,
    snapshot: string | null = null,
  ): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await session.run(
      `MATCH (m:Memory {id: $memoryId})
       CREATE (e:MemoryEvent {
         id: $id,
         action: $action,
         actor: $actor,
         details: $details,
         snapshot: $snapshot,
         createdAt: $now
       })
       CREATE (e)-[:EVENT_FOR]->(m)`,
      {
        id,
        memoryId,
        action,
        actor,
        details: JSON.stringify(details),
        snapshot,
        now,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Profile migration methods
  // ─────────────────────────────────────────────────────────────────────────────

  /** Count memories without profileId for a user */
  async countMemoriesWithoutProfile(userId: string): Promise<number> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE m.profileId IS NULL
         RETURN count(m) AS count`,
        { userId },
      );
      const record = result.records[0];
      return record ? toNeoInt(record.get("count")) : 0;
    });
  }

  /** Count all memories for a profile */
  async countMemoriesByProfile(
    userId: string,
    profileId: string,
  ): Promise<number> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId, profileId: $profileId})
         RETURN count(m) AS count`,
        { userId, profileId },
      );
      const record = result.records[0];
      return record ? toNeoInt(record.get("count")) : 0;
    });
  }

  /** Migrate all memories without profileId to a specific profile */
  async migrateMemoriesToProfile(
    userId: string,
    profileId: string,
  ): Promise<number> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE m.profileId IS NULL
         SET m.profileId = $profileId
         RETURN count(m) AS migrated`,
        { userId, profileId },
      );
      const record = result.records[0];
      return record ? toNeoInt(record.get("migrated")) : 0;
    });
  }

  /** Move memories from one profile to another */
  async moveMemoriesBetweenProfiles(
    userId: string,
    fromProfileId: string,
    toProfileId: string,
  ): Promise<number> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId, profileId: $fromProfileId})
         SET m.profileId = $toProfileId
         RETURN count(m) AS moved`,
        { userId, fromProfileId, toProfileId },
      );
      const record = result.records[0];
      return record ? toNeoInt(record.get("moved")) : 0;
    });
  }

  /** Delete all memories for a profile */
  async deleteMemoriesByProfile(
    userId: string,
    profileId: string,
  ): Promise<number> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId, profileId: $profileId})
         DETACH DELETE m
         RETURN count(m) AS deleted`,
        { userId, profileId },
      );
      const record = result.records[0];
      return record ? toNeoInt(record.get("deleted")) : 0;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Embedding backfill helpers
  //
  // Used by the one-shot migration in `convex/neo4jActions/migration.ts` to
  // fill in `m.embedding` on memories that were created before vector search
  // shipped, or created while the user had no OPENROUTER_API_KEY set.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Return a batch of memories that still have no embedding set. Ordered by
   * createdAt DESC so newest memories (most likely to be queried) get
   * embeddings first. Content is truncated in the JS layer by
   * `embeddingService.truncateForEmbedding` — no truncation here so callers
   * can choose their own strategy.
   */
  async listMissingEmbeddings(
    limit: number,
  ): Promise<
    Array<{ id: string; userId: string; title: string; content: string }>
  > {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory)
         WHERE m.embedding IS NULL
         RETURN m.id AS id, m.userId AS userId, m.title AS title, m.content AS content
         ORDER BY m.createdAt DESC
         LIMIT $limit`,
        { limit: neo4j.int(limit) },
      );
      return result.records.map((r) => ({
        id: String(r.get("id")),
        userId: String(r.get("userId")),
        title: String(r.get("title")),
        content: String(r.get("content")),
      }));
    });
  }

  /**
   * Bulk-set embeddings on existing memories by id. One round trip via
   * UNWIND to avoid N queries per batch.
   */
  async setEmbeddings(
    rows: Array<{ id: string; embedding: number[] }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.withSession(async (session) => {
      await session.run(
        `UNWIND $rows AS r
         MATCH (m:Memory {id: r.id})
         SET m.embedding = r.embedding`,
        { rows },
      );
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Team-scoped reads
  //
  // Access control: the caller is expected to have already verified team
  // membership at the Convex layer. These methods restrict results to a specific
  // team profile AND to the set of clerkIds allowed on that team (defence in
  // depth). Memories authored by removed ex-members stay with their original
  // userId and are still returned — attribution is preserved even though the
  // user is no longer in `allowedUserIds`. (This is intentional per product
  // decision: removed members' knowledge stays with the team.)
  //
  // To keep historical memories visible after member removal, team reads use
  // `m.profileId = $profileId` as the primary filter and do NOT require the
  // creator be currently in `allowedUserIds`.
  // ─────────────────────────────────────────────────────────────────────────────

  async listMemoriesForTeam(params: {
    profileId: string;
    type?: MemoryType;
    status?: MemoryStatus;
    tags?: string[];
    limit: number;
    offset: number;
  }): Promise<{ memories: MemoryWithTags[]; total: number }> {
    return this.withSession(async (session) => {
      const whereClauses = ["m.profileId = $profileId"];
      const queryParams: Record<
        string,
        string | number | Integer | string[] | null
      > = {
        profileId: params.profileId,
        limit: neo4j.int(params.limit),
        offset: neo4j.int(params.offset),
      };

      if (params.type) {
        whereClauses.push("m.type = $type");
        queryParams.type = params.type;
      }
      if (params.status) {
        whereClauses.push("m.status = $status");
        queryParams.status = params.status;
      }

      const hasTagFilter = !!params.tags && params.tags.length > 0;
      if (hasTagFilter && params.tags) {
        queryParams.filterTags = params.tags;
      }

      const where = whereClauses.join(" AND ");
      const filterTagsCount = params.tags?.length ?? 0;

      // Same index-joined tag-filter optimisation as listMemories: match the
      // tag node directly (hits the Tag name index) and require matched-tag
      // count to equal filter-tag count, avoiding per-memory TAGGED_WITH
      // relationship scans.
      const tagMatchClause = hasTagFilter
        ? `MATCH (m)-[:TAGGED_WITH]->(ft:Tag) WHERE ft.name IN $filterTags
           WITH m, count(DISTINCT ft) AS matchedTags
           WHERE matchedTags = ${filterTagsCount}`
        : "";

      const countResult = await session.run(
        `MATCH (m:Memory) WHERE ${where}
         ${tagMatchClause}
         RETURN count(m) AS total`,
        queryParams,
      );
      const countRecord = countResult.records[0];
      const total = countRecord ? toNeoInt(countRecord.get("total")) : 0;

      const result = await session.run(
        `MATCH (m:Memory) WHERE ${where}
         ${tagMatchClause}
         WITH m ORDER BY m.createdAt DESC SKIP $offset LIMIT $limit
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         RETURN m, collect(t.name) AS tags`,
        queryParams,
      );
      const memories = result.records.map(toMemoryWithTags);
      return { memories, total };
    });
  }

  async getMemoryForTeam(
    profileId: string,
    memoryId: string,
  ): Promise<MemoryWithTags | null> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, profileId: $profileId})
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         RETURN m, collect(t.name) AS tags`,
        { memoryId, profileId },
      );
      const firstRecord = result.records[0];
      if (!firstRecord) return null;
      return toMemoryWithTags(firstRecord);
    });
  }

  async searchMemoriesForTeam(params: {
    profileId: string;
    query?: string;
    type?: MemoryType;
    tags?: string[];
    source?: string;
    limit: number;
    offset: number;
  }): Promise<{ memories: MemoryWithTags[]; total: number }> {
    if (!params.query) {
      return this.listMemoriesForTeam({
        profileId: params.profileId,
        type: params.type,
        tags: params.tags,
        limit: params.limit,
        offset: params.offset,
      });
    }

    return this.withSession(async (session) => {
      const result = await session.run(
        `CALL db.index.fulltext.queryNodes('memory_content', $query)
         YIELD node AS m, score
         WHERE m.profileId = $profileId
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         RETURN m, collect(t.name) AS tags, score
         ORDER BY score DESC
         SKIP $offset LIMIT $limit`,
        {
          query: params.query,
          profileId: params.profileId,
          offset: neo4j.int(params.offset),
          limit: neo4j.int(params.limit),
        },
      );
      const memories = result.records.map(toMemoryWithTags);
      return { memories, total: memories.length };
    });
  }

  /**
   * Team-owner override for mutations: delete any memory on a team profile
   * regardless of original author. Scoped strictly by profileId to keep the
   * blast radius small.
   */
  async deleteTeamMemoryAsOwner(
    profileId: string,
    memoryId: string,
  ): Promise<boolean> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, profileId: $profileId})
         DETACH DELETE m
         RETURN count(m) AS deleted`,
        { memoryId, profileId },
      );
      const firstRecord = result.records[0];
      if (!firstRecord) return false;
      return toNeoInt(firstRecord.get("deleted")) > 0;
    });
  }
}
