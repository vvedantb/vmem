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
  /** Graph proximity boost. 1.0 for 1-hop, 0.5 for 2-hop, 0 otherwise. */
  graphBoost: number;
}

interface MatchedChunk {
  /** Chunk text content — the passage that matched. */
  content: string;
  /** 0-indexed position within the parent memory (for "result 3 of 12" style UX). */
  position: number;
}

interface MemoryCandidate extends MemoryWithTags {
  trace: {
    score: number;
    scoreBreakdown: ScoreBreakdown;
    reason: string;
  };
  /**
   * When the retrieval was driven (or augmented) by a paragraph-level
   * chunk match instead of the whole-memory embedding, the matched chunk
   * is surfaced here so UIs can show which passage of a long article
   * triggered the match. Absent when retrieval matched on the whole
   * memory only.
   */
  matchedChunk?: MatchedChunk;
}

/**
 * Kind of proposal:
 * - "update": replace `memory.content` with `proposedContent` on approve.
 * - "delete": delete the memory on approve. `proposedContent` is empty
 *    string; UI uses the linked memory's current content for the diff.
 * - "insight": Dream Mode synthesized a pattern across multiple memories.
 *    Approve creates a NEW :Memory + :DERIVED_FROM edges to sources.
 * - "connection": Bridge across two+ memories that share an entity/theme
 *    but weren't explicitly linked. Approve creates a NEW :Memory.
 * - "contradiction": Two memories disagree. V1 dismiss-only (user
 *    manually resolves the underlying conflict). No new memory on
 *    approve in V1 — this is informational.
 * - "anomaly": A single memory stands out from related memories. Approve
 *    creates a NEW :Memory summarizing the anomaly.
 */
type ProposedUpdateKind =
  | "update"
  | "delete"
  | "insight"
  | "connection"
  | "contradiction"
  | "anomaly";

const ALL_PROPOSED_UPDATE_KINDS: ReadonlySet<string> = new Set<string>([
  "update",
  "delete",
  "insight",
  "connection",
  "contradiction",
  "anomaly",
]);

function isProposedUpdateKind(value: string): value is ProposedUpdateKind {
  return ALL_PROPOSED_UPDATE_KINDS.has(value);
}

/** Origin of a proposal — used for attribution + filtering in the UI/audit log. */
type ProposalSource = "v2-extraction" | "dream-mode";

interface ProposedUpdateNode {
  id: string;
  /**
   * Target memory the proposal is "about" (update/delete: the one being
   * mutated; synthesis: the primary source memory). Empty string for
   * synthesis proposals that aren't tied to a single memory — callers
   * should use `sourceMemoryIds` instead in those cases.
   */
  memoryId: string;
  /** New body for update kind / synthesized text for synthesis kinds / "" for delete. */
  proposedContent: string;
  /**
   * Synthesis proposals carry their own title (a new memory needs one);
   * update/delete proposals leave this null and reuse the target's title.
   */
  proposedTitle: string | null;
  reason: string;
  /**
   * Default "update" for proposals created before V2 (the field is
   * absent on those Neo4j nodes; we coerce on read). New proposals
   * always set kind explicitly.
   */
  kind: ProposedUpdateKind;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
  /**
   * Memory IDs the proposal derives from. Empty array for legacy
   * update/delete proposals (those reuse `memoryId` as the single source).
   * Synthesis proposals always have ≥1 entry.
   */
  sourceMemoryIds: string[];
  /** LLM-reported confidence 0..1. Null on legacy update/delete proposals. */
  confidence: number | null;
  /** Where this proposal came from. Defaults to "v2-extraction" on legacy rows. */
  source: ProposalSource;
  /**
   * Snapshot of the target memory at list time. Lets the proposals UI
   * render the old text for a diff (UPDATE) or the body to be deleted
   * (DELETE) without an extra round-trip per proposal. Null when the
   * memory is missing (extremely rare — the UPDATE_FOR edge ought to
   * keep them paired; but a concurrent delete mid-query would do it),
   * or when the proposal is a synthesis kind not bound to a single target.
   */
  memorySnapshot: { title: string; content: string } | null;
  /**
   * Title + content snapshots of the source memories. Populated for
   * synthesis proposals so the UI can render the "derived from N
   * memories" panel without an extra round-trip per source. Empty for
   * non-synthesis proposals.
   */
  sourceMemorySnapshots: { id: string; title: string; content: string }[];
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

// ─────────────────────────────────────────────────────────────────────────────
// Content-hash deduplication helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize title+content into a stable string for hashing. Trims whitespace,
 * collapses runs of whitespace to a single space, and lowercases — so trivial
 * formatting differences ("  vmem " vs "vmem") produce the same hash.
 */
function normalizeForHash(title: string, content: string): string {
  return `${title}\n${content}`.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * MD5 hex digest of the normalized title+content. Used for exact-duplicate
 * detection at creation time — Mem0-style hash dedup with zero API cost.
 */
export function computeContentHash(title: string, content: string): string {
  return crypto
    .createHash("md5")
    .update(normalizeForHash(title, content))
    .digest("hex");
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
          tags: params.tags,
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

      // Semantic similarity edges — find top-5 most similar existing memories
      // using the vector index and create RELATES_TO edges above the threshold.
      // MERGE avoids duplicating edges that already exist from same-session or
      // same-domain; ON CREATE SET ensures score is only written on new edges.
      if (params.embedding !== null) {
        await session.run(
          `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
           YIELD node AS candidate, score AS similarity
           WHERE candidate.userId = $userId
             AND candidate.id <> $id
             AND similarity >= $threshold
           WITH candidate, similarity
           ORDER BY similarity DESC
           LIMIT $limit
           MATCH (m:Memory {id: $id})
           MERGE (m)-[r:RELATES_TO]->(candidate)
           ON CREATE SET r.reason = 'semantic similarity', r.score = similarity`,
          {
            k: neo4j.int(20),
            embedding: params.embedding,
            userId: params.userId,
            id,
            threshold: 0.78,
            limit: neo4j.int(5),
          },
        );
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

  // ─────────────────────────────────────────────────────────────────────────
  // Browsing-history title+domain deduplication
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find an existing browsing-history/bookmarks memory with the same title
   * from the same origin (protocol+host). Catches the "every page on my app
   * has &lt;title&gt;vmem&lt;/title&gt;" problem.
   */
  async findMemoryByTitleAndOrigin(
    userId: string,
    title: string,
    origin: string,
  ): Promise<{ id: string; title: string; updatedAt: string } | null> {
    return this.withSession(async (session) => {
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
   * Merge browsing-history memories that share the same (userId, title).
   * Keeps the oldest survivor per title, sums visitCounts, transfers edges,
   * and deletes the rest. Returns total duplicates deleted.
   */
  async deduplicateBrowsingHistory(userId: string): Promise<number> {
    return this.withSession(async (session) => {
      // Find all title groups with >1 browsing-history memory
      const groups = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE m.source IN ['browsing-history', 'bookmarks']
         WITH m.title AS title, m ORDER BY m.createdAt ASC
         WITH title, collect(m) AS sorted
         WHERE size(sorted) > 1
         RETURN title,
                head(sorted).id AS survivorId,
                [m IN tail(sorted) | m.id] AS duplicateIds,
                reduce(total = 0, m IN tail(sorted) | total + coalesce(m.visitCount, 1)) AS extraVisits`,
        { userId },
      );

      if (groups.records.length === 0) return 0;

      let totalDeleted = 0;

      for (const record of groups.records) {
        const survivorId = String(record.get("survivorId"));
        const duplicateIds: string[] = (
          record.get("duplicateIds") as string[]
        ).map(String);
        const rawVisits = record.get("extraVisits");
        const extraVisits =
          typeof rawVisits === "object" &&
          rawVisits !== null &&
          "toNumber" in rawVisits
            ? (rawVisits as { toNumber: () => number }).toNumber()
            : typeof rawVisits === "number"
              ? rawVisits
              : 0;

        // Transfer unique tags
        await session.run(
          `MATCH (survivor:Memory {id: $survivorId})
           UNWIND $duplicateIds AS dupId
           MATCH (dup:Memory {id: dupId})-[:TAGGED_WITH]->(t:Tag)
           WHERE NOT (survivor)-[:TAGGED_WITH]->(t)
           MERGE (survivor)-[:TAGGED_WITH]->(t)`,
          { survivorId, duplicateIds },
        );

        // Transfer unique RELATES_TO outgoing
        await session.run(
          `MATCH (survivor:Memory {id: $survivorId})
           UNWIND $duplicateIds AS dupId
           MATCH (dup:Memory {id: dupId})-[r:RELATES_TO]->(target)
           WHERE target.id <> $survivorId
             AND NOT (survivor)-[:RELATES_TO]->(target)
           MERGE (survivor)-[nr:RELATES_TO]->(target)
           ON CREATE SET nr.reason = r.reason, nr.score = r.score`,
          { survivorId, duplicateIds },
        );

        // Transfer unique RELATES_TO incoming
        await session.run(
          `MATCH (survivor:Memory {id: $survivorId})
           UNWIND $duplicateIds AS dupId
           MATCH (source)-[r:RELATES_TO]->(dup:Memory {id: dupId})
           WHERE source.id <> $survivorId
             AND NOT (source)-[:RELATES_TO]->(survivor)
           MERGE (source)-[nr:RELATES_TO]->(survivor)
           ON CREATE SET nr.reason = r.reason, nr.score = r.score`,
          { survivorId, duplicateIds },
        );

        // Transfer MENTIONS edges
        await session.run(
          `MATCH (survivor:Memory {id: $survivorId})
           UNWIND $duplicateIds AS dupId
           MATCH (dup:Memory {id: dupId})-[:MENTIONS]->(e:Entity)
           WHERE NOT (survivor)-[:MENTIONS]->(e)
           MERGE (survivor)-[:MENTIONS]->(e)`,
          { survivorId, duplicateIds },
        );

        // Sum visitCounts
        if (extraVisits > 0) {
          await session.run(
            `MATCH (m:Memory {id: $survivorId})
             SET m.visitCount = coalesce(m.visitCount, 1) + $extraVisits`,
            { survivorId, extraVisits },
          );
        }

        // Delete duplicates
        await session.run(
          `UNWIND $duplicateIds AS dupId
           MATCH (m:Memory {id: dupId})
           DETACH DELETE m`,
          { duplicateIds },
        );

        totalDeleted += duplicateIds.length;
      }

      return totalDeleted;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Content deduplication lookups
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find an active/pinned memory with the same content hash (exact duplicate).
   * Uses the (userId, contentHash) composite index for O(1) lookup.
   */
  async findMemoryByContentHash(
    userId: string,
    contentHash: string,
  ): Promise<{ id: string; title: string; updatedAt: string } | null> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId, contentHash: $contentHash})
         WHERE m.status IN ['active', 'pinned']
         RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
         LIMIT 1`,
        { userId, contentHash },
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
   * Find an existing memory by its (sourceType, sourceId) tuple — the
   * external-ID idempotency lookup. Used by callers who can supply a stable
   * external identifier (file content hash, Twitter bookmark ID, etc.) so
   * re-imports return the same memory without going through hash/URL/semantic
   * dedup. Backed by the composite index `memory_source_id` in setup.ts.
   */
  async findMemoryByExternalId(
    userId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<{ id: string; title: string; updatedAt: string } | null> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId, sourceType: $sourceType, sourceId: $sourceId})
         WHERE m.status IN ['active', 'pinned']
         RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
         LIMIT 1`,
        { userId, sourceType, sourceId },
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
   * Find the most semantically similar active/pinned memory above `threshold`.
   * Uses the vector index — only callable when an embedding is available.
   * Returns null when no memory exceeds the threshold.
   */
  async findMemoryBySimilarity(
    userId: string,
    embedding: number[],
    threshold: number,
  ): Promise<{
    id: string;
    title: string;
    updatedAt: string;
    similarity: number;
  } | null> {
    return this.withSession(async (session) => {
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
      if (result.records.length === 0) return null;
      const r = result.records[0];
      if (!r) return null;
      return {
        id: String(r.get("id")),
        title: String(r.get("title")),
        updatedAt: String(r.get("updatedAt")),
        similarity: Number(r.get("similarity")),
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

      const memoryId = String(firstRecord.get("id"));
      const wasCreated = Boolean(firstRecord.get("wasCreated"));

      // Semantic similarity edges on new memory creation (not updates)
      if (wasCreated && params.embedding !== null) {
        await session.run(
          `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
           YIELD node AS candidate, score AS similarity
           WHERE candidate.userId = $userId
             AND candidate.id <> $id
             AND similarity >= $threshold
           WITH candidate, similarity
           ORDER BY similarity DESC
           LIMIT $limit
           MATCH (m:Memory {id: $id})
           MERGE (m)-[r:RELATES_TO]->(candidate)
           ON CREATE SET r.reason = 'semantic similarity', r.score = similarity`,
          {
            k: neo4j.int(20),
            embedding: params.embedding,
            userId: params.userId,
            id: memoryId,
            threshold: 0.78,
            limit: neo4j.int(5),
          },
        );
      }

      return { id: memoryId, created: wasCreated };
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
      return toNeoInt(firstRecord.get("deleted")) > 0;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Chunk-level storage and retrieval
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Insert chunk nodes for a memory. Each chunk gets its own `:Chunk` node
   * with its own embedding, linked via `(:Memory)-[:HAS_CHUNK]->(:Chunk)`.
   * Single Cypher round-trip via UNWIND so a 50-chunk PDF is one query.
   *
   * Caller is responsible for chunking the text and generating embeddings
   * (see `chunking.ts` and `embeddingService.generateEmbeddings`).
   */
  async createChunksForMemory(params: {
    memoryId: string;
    userId: string;
    chunks: { content: string; startOffset: number; endOffset: number }[];
    embeddings: (number[] | null)[];
  }): Promise<void> {
    if (params.chunks.length === 0) return;
    return this.withSession(async (session) => {
      const now = new Date().toISOString();
      const rows = params.chunks.map((chunk, idx) => ({
        id: crypto.randomUUID(),
        position: idx,
        content: chunk.content,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        embedding: params.embeddings[idx] ?? null,
      }));
      await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         UNWIND $rows AS row
         CREATE (c:Chunk {
           id: row.id,
           memoryId: $memoryId,
           userId: $userId,
           position: row.position,
           content: row.content,
           startOffset: row.startOffset,
           endOffset: row.endOffset,
           embedding: row.embedding,
           createdAt: $now
         })
         CREATE (m)-[:HAS_CHUNK {position: row.position}]->(c)`,
        {
          memoryId: params.memoryId,
          userId: params.userId,
          rows,
          now,
        },
      );
    });
  }

  /**
   * Delete all chunks for a memory. Used by the chunk-rebuild path when a
   * memory's content changes and chunks need re-emitting. The standalone
   * `deleteMemory` already inlines this query so the cleanup is local.
   */
  async deleteChunksForMemory(userId: string, memoryId: string): Promise<void> {
    return this.withSession(async (session) => {
      await session.run(
        `MATCH (c:Chunk {memoryId: $memoryId, userId: $userId})
         DETACH DELETE c`,
        { memoryId, userId },
      );
    });
  }

  /**
   * Return memories whose `content` exceeds the given length and that have
   * not yet been chunked (no outgoing `HAS_CHUNK` edge). Used by the
   * one-shot backfill action to chunk pre-existing long memories.
   */
  async findUnchunkedLongMemories(
    userId: string,
    minLength: number,
    limit: number,
  ): Promise<{ id: string; content: string }[]> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE size(m.content) > $minLength
           AND NOT (m)-[:HAS_CHUNK]->(:Chunk)
         RETURN m.id AS id, m.content AS content
         LIMIT $limit`,
        {
          userId,
          minLength: neo4j.int(minLength),
          limit: neo4j.int(limit),
        },
      );
      return result.records.map((r) => ({
        id: String(r.get("id")),
        content: String(r.get("content")),
      }));
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

      // Leg 2b: chunk-level vector search — finds paragraph-level matches
      // inside long memories. Each chunk hit contributes its parent memory
      // plus the matched passage so the UI can show "result 3 of 12" style
      // breakdown. Slightly down-weighted vs whole-memory matches (0.85x in
      // RRF) so a chunk-only hit cannot beat a strong whole-memory match.
      const chunkResult = params.queryEmbedding
        ? await session.run(
            `CALL db.index.vector.queryNodes('chunk_embedding', $k, $queryVector)
             YIELD node AS c, score AS chunkScore
             WHERE c.userId = $userId
             MATCH (m:Memory {id: c.memoryId})
             WHERE m.userId = $userId ${profileFilter}
             OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
             WITH m, collect(t.name) AS tags, chunkScore, c.content AS chunkContent,
                  c.position AS chunkPosition,
                  duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
             RETURN m, tags, chunkScore, chunkContent, chunkPosition, ageInDays
             ORDER BY chunkScore DESC`,
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
        chunkScore: number;
        recencyScore: number;
        confidenceScore: number;
        ftRank: number | null;
        vecRank: number | null;
        chunkRank: number | null;
        graphHops: number | null;
        matchedChunk: MatchedChunk | null;
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
          chunkScore: 0,
          recencyScore: recencyFromAgeDays(ageInDays),
          confidenceScore: memory.confidence,
          ftRank: idx + 1,
          vecRank: null,
          chunkRank: null,
          graphHops: null,
          matchedChunk: null,
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
              chunkScore: 0,
              recencyScore: recencyFromAgeDays(ageInDays),
              confidenceScore: memory.confidence,
              ftRank: null,
              vecRank: idx + 1,
              chunkRank: null,
              graphHops: null,
              matchedChunk: null,
            });
          }
        });
      }

      if (chunkResult) {
        // Group by parent memory id and keep the highest-scoring chunk per
        // memory — we surface only one "matchedChunk" per result, even if
        // multiple chunks of the same memory matched.
        const seenMemoryIds = new Set<string>();
        chunkResult.records.forEach((record, idx) => {
          const memory = toMemoryWithTags(record);
          if (seenMemoryIds.has(memory.id)) return;
          seenMemoryIds.add(memory.id);
          const chunkScore = Number(record.get("chunkScore"));
          const ageInDays = toNeoInt(record.get("ageInDays"));
          const chunkContent = String(record.get("chunkContent") ?? "");
          const chunkPosition = toNeoInt(record.get("chunkPosition"));
          const matchedChunk: MatchedChunk = {
            content: chunkContent,
            position: chunkPosition,
          };
          const existing = merged.get(memory.id);
          if (existing) {
            existing.chunkScore = chunkScore;
            existing.chunkRank = idx + 1;
            // Only attach matched chunk if not already set (unlikely since
            // we dedupe via seenMemoryIds, but defensive).
            existing.matchedChunk ??= matchedChunk;
          } else {
            merged.set(memory.id, {
              memory,
              fulltextScore: 0,
              vectorScore: 0,
              chunkScore,
              recencyScore: recencyFromAgeDays(ageInDays),
              confidenceScore: memory.confidence,
              ftRank: null,
              vecRank: null,
              chunkRank: idx + 1,
              graphHops: null,
              matchedChunk,
            });
          }
        });
      }

      // Leg 3: Graph expansion — discover memories 1-2 hops from the top
      // initial BM25/vector/chunk matches via RELATES_TO and MENTIONS edges.
      const TOP_N_SEEDS = 5;
      const CHUNK_RRF_WEIGHT = 0.85;
      const computeRrf = (entry: MergedEntry): number =>
        (entry.ftRank === null ? 0 : rrfScore(entry.ftRank)) +
        (entry.vecRank === null ? 0 : rrfScore(entry.vecRank)) +
        (entry.chunkRank === null
          ? 0
          : rrfScore(entry.chunkRank) * CHUNK_RRF_WEIGHT);
      const topSeeds = Array.from(merged.entries())
        .sort((a, b) => computeRrf(b[1]) - computeRrf(a[1]))
        .slice(0, TOP_N_SEEDS)
        .map(([id]) => id);

      const graphNeighbors =
        topSeeds.length > 0
          ? await this.expandViaGraph(topSeeds, params.userId, params.limit)
          : [];

      // Merge graph-discovered memories into the result set
      for (const gn of graphNeighbors) {
        const existing = merged.get(gn.id);
        if (existing) {
          existing.graphHops = gn.hops;
        }
      }

      // Fetch metadata for graph-only discoveries (not in BM25/vector results)
      const graphOnlyIds = graphNeighbors
        .filter((gn) => !merged.has(gn.id))
        .map((gn) => gn.id);

      if (graphOnlyIds.length > 0) {
        const metadata = await this.fetchMemoryMetadata(
          graphOnlyIds,
          params.userId,
        );
        for (const gn of graphNeighbors) {
          if (merged.has(gn.id)) continue;
          const meta = metadata.get(gn.id);
          if (!meta) continue;
          merged.set(gn.id, {
            memory: meta.memory,
            fulltextScore: 0,
            vectorScore: 0,
            chunkScore: 0,
            recencyScore: recencyFromAgeDays(meta.ageInDays),
            confidenceScore: meta.memory.confidence,
            ftRank: null,
            vecRank: null,
            chunkRank: null,
            graphHops: gn.hops,
            matchedChunk: null,
          });
        }
      }

      const candidates: MemoryCandidate[] = Array.from(merged.values()).map(
        (entry) => {
          const rrfCombined = computeRrf(entry);
          const graphBoost =
            entry.graphHops === null
              ? 0
              : entry.graphHops === 1
                ? 1.0
                : entry.graphHops === 2
                  ? 0.5
                  : 0;
          const totalScore =
            rrfCombined * 0.45 +
            graphBoost * 0.1 +
            entry.recencyScore * 0.225 +
            entry.confidenceScore * 0.225;

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
          // Chunk-level match: a specific paragraph in a long memory matched
          // even if the whole-memory embedding/fulltext didn't rank it
          // highly. Surface this so users see "matched on a passage" as a
          // distinct reason from whole-memory match.
          if (
            entry.chunkScore > 0 &&
            entry.vecRank === null &&
            entry.ftRank === null
          ) {
            reasons.push("matched specific passage in long content");
          } else if (entry.chunkScore > 0) {
            reasons.push("matched specific passage");
          }
          if (entry.graphHops === 1) {
            reasons.push("directly connected in knowledge graph");
          } else if (entry.graphHops === 2) {
            reasons.push("nearby in knowledge graph (2 hops)");
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
                graphBoost,
              },
              reason:
                reasons.length > 0
                  ? `Matched because: ${reasons.join(", ")}`
                  : "Weak match across all signals",
            },
            matchedChunk: entry.matchedChunk ?? undefined,
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
           proposedTitle: null,
           reason: $reason,
           kind: 'update',
           status: 'pending',
           createdAt: $now,
           resolvedAt: null,
           sourceMemoryIds: [],
           confidence: null,
           source: 'v2-extraction'
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
        proposedTitle: null,
        reason: props.reason,
        kind: "update",
        status: props.status,
        createdAt: props.createdAt,
        resolvedAt: null,
        sourceMemoryIds: [],
        confidence: null,
        source: "v2-extraction",
        // The create paths don't pre-fetch the memory snapshot — list/
        // resolve callers don't need it on the return of a create. The
        // listProposedUpdates query joins it back when it's needed.
        memorySnapshot: null,
        sourceMemorySnapshots: [],
      };
    });
  }

  /**
   * V2 fact-extraction emits "delete this old memory because the user just
   * stated a contradicting fact" → recorded as a `:ProposedUpdate` with
   * `kind: 'delete'` so the user explicitly approves before destructive
   * action. Mirrors `createProposedUpdate` shape so the existing list /
   * resolve plumbing handles both.
   */
  async createProposedDelete(params: {
    memoryId: string;
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
           proposedContent: '',
           proposedTitle: null,
           reason: $reason,
           kind: 'delete',
           status: 'pending',
           createdAt: $now,
           resolvedAt: null,
           sourceMemoryIds: [],
           confidence: null,
           source: 'v2-extraction'
         })
         CREATE (p)-[:UPDATE_FOR]->(m)
         RETURN p`,
        {
          id,
          memoryId: params.memoryId,
          reason: params.reason,
          now,
        },
      );

      const firstRecord = result.records[0];
      if (!firstRecord) throw new Error("Failed to create proposed delete");
      const props = firstRecord.get("p").properties;
      return {
        id: props.id,
        memoryId: props.memoryId,
        proposedContent: "",
        proposedTitle: null,
        reason: props.reason,
        kind: "delete",
        status: props.status,
        createdAt: props.createdAt,
        resolvedAt: null,
        sourceMemoryIds: [],
        confidence: null,
        source: "v2-extraction",
        memorySnapshot: null,
        sourceMemorySnapshots: [],
      };
    });
  }

  async listProposedUpdates(userId: string): Promise<ProposedUpdateNode[]> {
    return this.withSession(async (session) => {
      // Pull the target memory's title + content alongside each proposal
      // so the proposals UI can render a diff without a round-trip per
      // row. For synthesis proposals (sourceMemoryIds non-empty), also
      // collect the source memories so the UI can render the "derived
      // from" panel without a per-row fetch.
      //
      // We OPTIONAL MATCH the UPDATE_FOR target because synthesis
      // proposals carry an empty memoryId / no UPDATE_FOR edge — the
      // ownership filter then falls through to the source memories'
      // userId via the sourceMemoryIds lookup below.
      const result = await session.run(
        `MATCH (p:ProposedUpdate {status: 'pending'})
         OPTIONAL MATCH (p)-[:UPDATE_FOR]->(m:Memory)
         WITH p, m
         OPTIONAL MATCH (src:Memory {userId: $userId})
           WHERE src.id IN coalesce(p.sourceMemoryIds, [])
         WITH p, m,
              collect(DISTINCT { id: src.id, title: src.title, content: src.content }) AS sources
         WHERE (m IS NOT NULL AND m.userId = $userId)
            OR size([s IN sources WHERE s.id IS NOT NULL]) > 0
         RETURN p,
                m.title AS memoryTitle,
                m.content AS memoryContent,
                [s IN sources WHERE s.id IS NOT NULL] AS sourceSnaps
         ORDER BY p.createdAt DESC`,
        { userId },
      );

      return result.records.map((record) => {
        const props = record.get("p").properties;
        // `kind` is absent on pre-V2 proposals — coerce to "update".
        const rawKind = String(props.kind ?? "update");
        const kind: ProposedUpdateKind = isProposedUpdateKind(rawKind)
          ? rawKind
          : "update";

        const titleRaw = record.get("memoryTitle");
        const contentRaw = record.get("memoryContent");
        const memorySnapshot =
          typeof titleRaw === "string" && typeof contentRaw === "string"
            ? { title: titleRaw, content: contentRaw }
            : null;

        const rawSources = record.get("sourceSnaps");
        const sourceMemorySnapshots: {
          id: string;
          title: string;
          content: string;
        }[] = Array.isArray(rawSources)
          ? rawSources.flatMap((s: unknown) => {
              if (typeof s !== "object" || s === null) return [];
              const id = Reflect.get(s, "id");
              const title = Reflect.get(s, "title");
              const content = Reflect.get(s, "content");
              if (
                typeof id === "string" &&
                typeof title === "string" &&
                typeof content === "string"
              ) {
                return [{ id, title, content }];
              }
              return [];
            })
          : [];

        const rawSourceIds = props.sourceMemoryIds;
        const sourceMemoryIds: string[] = Array.isArray(rawSourceIds)
          ? rawSourceIds.filter(
              (x: unknown): x is string => typeof x === "string",
            )
          : [];

        const rawConfidence: unknown = props.confidence;
        const confidence: number | null =
          typeof rawConfidence === "number" ? rawConfidence : null;

        const rawSource = props.source;
        const source: ProposalSource =
          rawSource === "dream-mode" ? "dream-mode" : "v2-extraction";

        return {
          id: props.id,
          memoryId: props.memoryId ?? "",
          proposedContent: props.proposedContent ?? "",
          proposedTitle:
            typeof props.proposedTitle === "string"
              ? props.proposedTitle
              : null,
          reason: props.reason ?? "",
          kind,
          status: props.status,
          createdAt: props.createdAt,
          resolvedAt: props.resolvedAt ?? null,
          sourceMemoryIds,
          confidence,
          source,
          memorySnapshot,
          sourceMemorySnapshots,
        };
      });
    });
  }

  /**
   * Approve or reject a proposed update / delete / synthesis.
   *
   * Legacy V2 fact-extraction kinds (UPDATE_FOR-bound):
   * - Update + approve: copy `proposedContent` onto the existing memory.
   * - Delete + approve: hard-delete the existing memory + its chunks.
   *
   * Dream Mode V2 synthesis kinds (DERIVED_FROM-bound, no UPDATE_FOR):
   * - insight / connection / anomaly + approve: materialize a NEW :Memory
   *   (type='knowledge', source='dream-mode') with :DERIVED_FROM edges
   *   pointing back to each source memory. The new memory's id is
   *   returned in `memoryId` so the caller can backfill its embedding.
   * - contradiction + approve OR reject: V1 just marks the proposal
   *   resolved. The user is expected to manually edit / delete the
   *   conflicting memories; we don't try to auto-resolve. (V2 TODO:
   *   structured "pick one" UI that hard-deletes the loser.)
   *
   * Reject (any kind): mark resolved, no graph mutation.
   *
   * Returns null when the proposal id doesn't exist or doesn't belong
   * to the caller. The calling Convex action verifies ownership before
   * invoking this.
   */
  async resolveProposal(
    proposalId: string,
    action: "approve" | "reject",
  ): Promise<{
    status: string;
    memoryId: string;
    kind: ProposedUpdateKind;
    /** Set when approve materialized a new memory (synthesis kinds). */
    materializedMemoryId?: string;
  } | null> {
    return this.withSession(async (session) => {
      const now = new Date().toISOString();

      // Lookup: find the proposal by id. For legacy update/delete kinds
      // we expect a UPDATE_FOR edge to the target memory; synthesis
      // proposals have no UPDATE_FOR edge but carry sourceMemoryIds — we
      // resolve the userId/profileId from the first source.
      const lookup = await session.run(
        `MATCH (p:ProposedUpdate {id: $proposalId})
         OPTIONAL MATCH (p)-[:UPDATE_FOR]->(target:Memory)
         OPTIONAL MATCH (firstSource:Memory)
           WHERE firstSource.id = head(coalesce(p.sourceMemoryIds, []))
         RETURN
           coalesce(p.kind, 'update') AS kind,
           p.proposedTitle AS proposedTitle,
           p.proposedContent AS proposedContent,
           coalesce(p.sourceMemoryIds, []) AS sourceMemoryIds,
           p.confidence AS confidence,
           target.id AS targetId,
           target.userId AS targetUserId,
           firstSource.userId AS sourceUserId,
           firstSource.profileId AS sourceProfileId`,
        { proposalId },
      );
      if (lookup.records.length === 0) return null;
      const lookupRecord = lookup.records[0];
      if (!lookupRecord) return null;

      const rawKind = String(lookupRecord.get("kind"));
      const kind: ProposedUpdateKind = isProposedUpdateKind(rawKind)
        ? rawKind
        : "update";

      // Pick the userId/memoryId we'll log against. For legacy kinds
      // it's the UPDATE_FOR target; for synthesis it's the first source.
      const targetIdRaw = lookupRecord.get("targetId");
      const targetUserIdRaw = lookupRecord.get("targetUserId");
      const sourceUserIdRaw = lookupRecord.get("sourceUserId");
      const sourceProfileIdRaw = lookupRecord.get("sourceProfileId");
      const sourceIdsRawForLookup: unknown =
        lookupRecord.get("sourceMemoryIds");
      const firstSourceId: string =
        Array.isArray(sourceIdsRawForLookup) &&
        typeof sourceIdsRawForLookup[0] === "string"
          ? sourceIdsRawForLookup[0]
          : "";
      const memoryId =
        typeof targetIdRaw === "string" && targetIdRaw.length > 0
          ? targetIdRaw
          : firstSourceId;
      const userId =
        typeof targetUserIdRaw === "string" && targetUserIdRaw.length > 0
          ? targetUserIdRaw
          : typeof sourceUserIdRaw === "string"
            ? sourceUserIdRaw
            : "";

      if (action === "reject") {
        await session.run(
          `MATCH (p:ProposedUpdate {id: $proposalId})
           SET p.status = 'rejected', p.resolvedAt = $now`,
          { proposalId, now },
        );
        if (memoryId.length > 0) {
          await this.logEvent(
            session,
            memoryId,
            "proposal_rejected",
            "api",
            { kind },
            null,
          );
        }
        return { status: "rejected", memoryId, kind };
      }

      // ── APPROVE branches ────────────────────────────────────────────

      if (kind === "delete") {
        // Approving a delete proposal hard-deletes the memory and all its
        // chunks. The proposal itself is also removed (DETACH DELETE on
        // the memory takes its UPDATE_FOR edge with it).
        await session.run(
          `MATCH (c:Chunk {memoryId: $memoryId, userId: $userId})
           DETACH DELETE c`,
          { memoryId, userId },
        );
        await session.run(
          `MATCH (p:ProposedUpdate {id: $proposalId})-[:UPDATE_FOR]->(m:Memory)
           SET p.status = 'approved', p.resolvedAt = $now
           WITH m
           DETACH DELETE m`,
          { proposalId, now },
        );
        await this.logEvent(
          session,
          memoryId,
          "proposal_approved",
          "api",
          { kind: "delete" },
          null,
        );
        return { status: "approved", memoryId, kind };
      }

      if (kind === "update") {
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
          { kind: "update" },
          toSnapshot(memory),
        );

        return {
          status: String(firstRecord.get("status")),
          memoryId: memory.id,
          kind: "update",
        };
      }

      if (kind === "contradiction") {
        // V1: contradictions are dismiss-only. Approve and reject are
        // both no-op against the underlying memories — the user resolves
        // the conflict manually by editing/deleting one side. We still
        // mark the proposal resolved so it leaves the queue.
        // TODO(V2): structured "pick winner" UI that hard-deletes the
        // memory the user did not pick.
        await session.run(
          `MATCH (p:ProposedUpdate {id: $proposalId})
           SET p.status = 'approved', p.resolvedAt = $now`,
          { proposalId, now },
        );
        if (memoryId.length > 0) {
          await this.logEvent(
            session,
            memoryId,
            "proposal_approved",
            "api",
            { kind: "contradiction" },
            null,
          );
        }
        return { status: "approved", memoryId, kind };
      }

      // kind ∈ { insight, connection, anomaly } — synthesis materialization.
      // Create a NEW :Memory carrying the proposal's title/content with
      // type='knowledge' and source='dream-mode', then attach
      // :DERIVED_FROM edges to every source memory.
      const proposedTitleRaw = lookupRecord.get("proposedTitle");
      const proposedContentRaw = lookupRecord.get("proposedContent");
      const confidenceRaw = lookupRecord.get("confidence");

      const proposedTitle =
        typeof proposedTitleRaw === "string" && proposedTitleRaw.length > 0
          ? proposedTitleRaw
          : "Untitled synthesis";
      const proposedContent =
        typeof proposedContentRaw === "string" ? proposedContentRaw : "";
      const sourceMemoryIds: string[] = Array.isArray(sourceIdsRawForLookup)
        ? sourceIdsRawForLookup.filter(
            (x: unknown): x is string => typeof x === "string",
          )
        : [];
      const confidence: number | null =
        typeof confidenceRaw === "number" ? confidenceRaw : null;

      if (sourceMemoryIds.length === 0) {
        // Malformed synthesis proposal — no sources to derive from.
        // Reject silently rather than create an orphaned memory.
        await session.run(
          `MATCH (p:ProposedUpdate {id: $proposalId})
           SET p.status = 'rejected', p.resolvedAt = $now`,
          { proposalId, now },
        );
        return { status: "rejected", memoryId, kind };
      }

      const newMemoryId = crypto.randomUUID();
      const profileId =
        typeof sourceProfileIdRaw === "string" ? sourceProfileIdRaw : null;
      const contentHash = computeContentHash(proposedTitle, proposedContent);

      await session.run(
        `MATCH (p:ProposedUpdate {id: $proposalId})
         SET p.status = 'approved', p.resolvedAt = $now
         WITH p
         CREATE (m:Memory {
           id: $newMemoryId,
           userId: $userId,
           profileId: $profileId,
           title: $title,
           content: $content,
           type: 'knowledge',
           source: 'dream-mode',
           confidence: $confidence,
           status: 'active',
           createdAt: $now,
           updatedAt: $now,
           expiresAt: null,
           url: null,
           embedding: null,
           contentHash: $contentHash,
           sourceType: null,
           sourceId: null,
           storageId: null,
           mimeType: null,
           originalFilename: null,
           visitCount: 1,
           firstVisitAt: $now,
           lastVisitAt: $now
         })
         WITH m
         MERGE (s:Source {name: 'dream-mode'})
         CREATE (m)-[:FROM_SOURCE]->(s)
         WITH m
         UNWIND $sourceMemoryIds AS sid
         MATCH (src:Memory {id: sid, userId: $userId})
         MERGE (m)-[:DERIVED_FROM]->(src)`,
        {
          proposalId,
          now,
          newMemoryId,
          userId,
          profileId,
          title: proposedTitle,
          content: proposedContent,
          confidence,
          contentHash,
          sourceMemoryIds,
        },
      );

      await this.logEvent(
        session,
        newMemoryId,
        "created",
        "dream-mode",
        { kind, source: "synthesis-approve" },
        toSnapshot({
          title: proposedTitle,
          content: proposedContent,
          type: "knowledge",
          status: "active",
          confidence: confidence ?? 0,
          tags: [],
        }),
      );

      return {
        status: "approved",
        memoryId: newMemoryId,
        materializedMemoryId: newMemoryId,
        kind,
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
      console.log(
        `[getRecentActivity] userId=${userId} profileId=${String(profileId)} records=${result.records.length}`,
      );

      const now = Date.now();
      return result.records.map((record) => {
        const props = record.get("e").properties;
        const memoryTitle = String(
          props.memoryTitle ?? record.get("memoryTitle"),
        );
        const action = String(props.action);
        const actor = String(props.actor ?? "");
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

        // Dream Mode-materialized memories use actor='dream-mode' on the
        // logEvent call. We promote those into a distinct activity type so
        // the feed can filter / icon them separately from manual creates.
        const isDreamMode = actor === "dream-mode";

        const typeMap: Record<string, string> = {
          created: isDreamMode ? "memory_dream_created" : "memory_created",
          updated: "memory_updated",
          deleted: "memory_deleted",
        };

        const descMap: Record<string, string> = {
          created: isDreamMode
            ? `Dream Mode synthesized "${memoryTitle}"`
            : `Created "${memoryTitle}"`,
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
    entities: Array<{
      normalizedName: string;
      name: string;
      type: string;
      memoryIds: string[];
    }>;
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
             RETURN collect({source: a.id, target: b.id, reason: r.reason, score: r.score}) AS relatesToEdges
           }
           CALL (nodeIds) {
             MATCH (m:Memory)-[:MENTIONS]->(e:Entity)
             WHERE m.id IN nodeIds
             WITH e, collect(m.id) AS memoryIds
             RETURN collect({
               normalizedName: e.normalizedName, name: e.name,
               type: e.type, memoryIds: memoryIds
             }) AS entities
           }
           RETURN nodes, relatesToEdges, entities`,
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
      const rawEntities = combinedRow ? combinedRow.get("entities") : [];

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

      const entities = (Array.isArray(rawEntities) ? rawEntities : []).map(
        (e) => ({
          normalizedName: String(e.normalizedName),
          name: String(e.name),
          type: String(e.type),
          memoryIds: Array.isArray(e.memoryIds) ? e.memoryIds.map(String) : [],
        }),
      );

      const tagEdges = tagEdgesResult.records.map(toTagEdge);

      return { nodes, relatesToEdges, tagEdges, entities };
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
      return { nodes: [], relatesToEdges: [], tagEdges: [], entities: [] };
    }

    // Edges scoped to the local neighbourhood: RELATES_TO, tag-shared, and
    // entity data are computed in Cypher in parallel across separate sessions.
    const relatesToSession = this.driver.session();
    const tagEdgesSession = this.driver.session();
    const entitySession = this.driver.session();
    try {
      const [relatesToResult, tagEdgesResult, entityResult] = await Promise.all(
        [
          relatesToSession.run(
            `MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
           WHERE a.id IN $nodeIds AND b.id IN $nodeIds
           RETURN a.id AS source, b.id AS target, r.reason AS reason, r.score AS score`,
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
          entitySession.run(
            `MATCH (m:Memory)-[:MENTIONS]->(e:Entity)
           WHERE m.id IN $nodeIds
           WITH e, collect(m.id) AS memoryIds
           RETURN e.normalizedName AS normalizedName, e.name AS name,
                  e.type AS type, memoryIds`,
            { nodeIds },
          ),
        ],
      );

      const relatesToEdges = relatesToResult.records.map((r) => {
        const rawScore = r.get("score");
        return {
          source: String(r.get("source")),
          target: String(r.get("target")),
          reason: String(r.get("reason") ?? ""),
          score:
            rawScore !== null && rawScore !== undefined
              ? Number(rawScore)
              : undefined,
        };
      });

      const entities = entityResult.records.map((r) => ({
        normalizedName: String(r.get("normalizedName")),
        name: String(r.get("name")),
        type: String(r.get("type")),
        memoryIds: Array.isArray(r.get("memoryIds"))
          ? r.get("memoryIds").map(String)
          : [],
      }));

      const tagEdges = tagEdgesResult.records.map(toTagEdge);

      return { nodes, relatesToEdges, tagEdges, entities };
    } finally {
      await Promise.all([
        relatesToSession.close(),
        tagEdgesSession.close(),
        entitySession.close(),
      ]);
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
    entities: Array<{
      name: string;
      normalizedName: string;
      type: string;
    }> = [],
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

        // Entity extraction: delete old MENTIONS edges, MERGE entity nodes,
        // re-create MENTIONS edges. Same pattern as TAGGED_WITH above.
        if (entities.length > 0) {
          await tx.run(
            `MATCH (m:Memory {id: $memoryId, userId: $userId})
             OPTIONAL MATCH (m)-[r:MENTIONS]->(:Entity)
             DELETE r
             WITH m
             FOREACH (ent IN $entities |
               MERGE (e:Entity {userId: $userId, normalizedName: ent.normalizedName, type: ent.type})
               ON CREATE SET e.name = ent.name, e.id = randomUUID(), e.createdAt = datetime()
               MERGE (m)-[:MENTIONS]->(e)
             )`,
            { memoryId, userId, entities },
          );
        }

        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    });
  }

  /**
   * Entity-only enrichment for backfill. Applies MENTIONS edges without
   * touching tags or RELATES_TO edges.
   */
  async applyEntitiesOnly(
    memoryId: string,
    userId: string,
    entities: Array<{
      name: string;
      normalizedName: string;
      type: string;
    }>,
  ): Promise<void> {
    if (entities.length === 0) return;
    return this.withSession(async (session) => {
      await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         OPTIONAL MATCH (m)-[r:MENTIONS]->(:Entity)
         DELETE r
         WITH m
         FOREACH (ent IN $entities |
           MERGE (e:Entity {userId: $userId, normalizedName: ent.normalizedName, type: ent.type})
           ON CREATE SET e.name = ent.name, e.id = randomUUID(), e.createdAt = datetime()
           MERGE (m)-[:MENTIONS]->(e)
         )`,
        { memoryId, userId, entities },
      );
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

    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId})
       CREATE (e:MemoryEvent {
         id: $id,
         action: $action,
         actor: $actor,
         details: $details,
         snapshot: $snapshot,
         createdAt: $now
       })
       CREATE (e)-[:EVENT_FOR]->(m)
       RETURN e.id AS eventId`,
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
    console.log(
      `[logEvent] action=${action} memoryId=${memoryId} created=${result.records.length > 0}`,
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
  async listMissingEmbeddings(limit: number): Promise<
    Array<{
      id: string;
      userId: string;
      profileId: string | null;
      title: string;
      content: string;
    }>
  > {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory)
         WHERE m.embedding IS NULL
         RETURN m.id AS id, m.userId AS userId, m.profileId AS profileId, m.title AS title, m.content AS content
         ORDER BY m.createdAt DESC
         LIMIT $limit`,
        { limit: neo4j.int(limit) },
      );
      return result.records.map((r) => {
        const rawProfileId = r.get("profileId");
        return {
          id: String(r.get("id")),
          userId: String(r.get("userId")),
          profileId:
            typeof rawProfileId === "string" && rawProfileId.length > 0
              ? rawProfileId
              : null,
          title: String(r.get("title")),
          content: String(r.get("content")),
        };
      });
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
  // Content-hash backfill helpers
  //
  // Used by the migration in `convex/neo4jActions/migration.ts` to retroactively
  // compute and store contentHash for memories created before dedup shipped.
  // Pure CPU work (MD5), no external API calls.
  // ─────────────────────────────────────────────────────────────────────────────

  /** Return memories that don't have a contentHash yet. */
  async listMissingContentHash(
    limit: number,
  ): Promise<Array<{ id: string; title: string; content: string }>> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory)
         WHERE m.contentHash IS NULL
         RETURN m.id AS id, m.title AS title, m.content AS content
         ORDER BY m.createdAt DESC
         LIMIT $limit`,
        { limit: neo4j.int(limit) },
      );
      return result.records.map((r) => ({
        id: String(r.get("id")),
        title: String(r.get("title")),
        content: String(r.get("content")),
      }));
    });
  }

  /**
   * Bulk-set contentHash on existing memories by id. One round trip via
   * UNWIND to avoid N queries per batch.
   */
  async setContentHashes(
    rows: Array<{ id: string; contentHash: string }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.withSession(async (session) => {
      await session.run(
        `UNWIND $rows AS r
         MATCH (m:Memory {id: r.id})
         SET m.contentHash = r.contentHash`,
        { rows },
      );
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Content-hash dedup cleanup
  //
  // Finds groups of memories sharing the same (userId, contentHash) and merges
  // them: the oldest survives, accumulates visitCount from duplicates, inherits
  // any unique relationships/tags, and the duplicates are detached + deleted.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Merge duplicate memories for a single user. Returns the number of
   * duplicate nodes deleted. Safe to re-run (idempotent — no-ops when
   * no duplicates remain).
   */
  async deduplicateMemories(userId: string): Promise<number> {
    return this.withSession(async (session) => {
      // Step 1: Find all duplicate groups. For each contentHash with >1 memory,
      // collect the IDs ordered by createdAt ASC (oldest = survivor).
      const groups = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE m.contentHash IS NOT NULL
         WITH m.contentHash AS hash, m ORDER BY m.createdAt ASC
         WITH hash, collect(m) AS sorted
         WHERE size(sorted) > 1
         RETURN hash,
                head(sorted).id AS survivorId,
                [m IN tail(sorted) | m.id] AS duplicateIds,
                reduce(total = 0, m IN tail(sorted) | total + coalesce(m.visitCount, 1)) AS extraVisits`,
        { userId },
      );

      if (groups.records.length === 0) return 0;

      let totalDeleted = 0;

      for (const record of groups.records) {
        const survivorId = String(record.get("survivorId"));
        const duplicateIds: string[] = (
          record.get("duplicateIds") as string[]
        ).map(String);
        const rawVisits = record.get("extraVisits");
        const extraVisits =
          typeof rawVisits === "object" &&
          rawVisits !== null &&
          "toNumber" in rawVisits
            ? (rawVisits as { toNumber: () => number }).toNumber()
            : typeof rawVisits === "number"
              ? rawVisits
              : 0;

        // Step 2: Transfer unique tags from duplicates → survivor
        await session.run(
          `MATCH (survivor:Memory {id: $survivorId})
           UNWIND $duplicateIds AS dupId
           MATCH (dup:Memory {id: dupId})-[:TAGGED_WITH]->(t:Tag)
           WHERE NOT (survivor)-[:TAGGED_WITH]->(t)
           MERGE (survivor)-[:TAGGED_WITH]->(t)`,
          { survivorId, duplicateIds },
        );

        // Step 3: Transfer unique RELATES_TO edges from duplicates → survivor
        // (both outgoing and incoming, excluding self-loops)
        await session.run(
          `MATCH (survivor:Memory {id: $survivorId})
           UNWIND $duplicateIds AS dupId
           MATCH (dup:Memory {id: dupId})-[r:RELATES_TO]->(target)
           WHERE target.id <> $survivorId
             AND NOT (survivor)-[:RELATES_TO]->(target)
           MERGE (survivor)-[nr:RELATES_TO]->(target)
           ON CREATE SET nr.reason = r.reason, nr.score = r.score`,
          { survivorId, duplicateIds },
        );
        await session.run(
          `MATCH (survivor:Memory {id: $survivorId})
           UNWIND $duplicateIds AS dupId
           MATCH (source)-[r:RELATES_TO]->(dup:Memory {id: dupId})
           WHERE source.id <> $survivorId
             AND NOT (source)-[:RELATES_TO]->(survivor)
           MERGE (source)-[nr:RELATES_TO]->(survivor)
           ON CREATE SET nr.reason = r.reason, nr.score = r.score`,
          { survivorId, duplicateIds },
        );

        // Step 4: Transfer MENTIONS edges from duplicates → survivor
        await session.run(
          `MATCH (survivor:Memory {id: $survivorId})
           UNWIND $duplicateIds AS dupId
           MATCH (dup:Memory {id: dupId})-[:MENTIONS]->(e:Entity)
           WHERE NOT (survivor)-[:MENTIONS]->(e)
           MERGE (survivor)-[:MENTIONS]->(e)`,
          { survivorId, duplicateIds },
        );

        // Step 5: Bump survivor's visitCount with the sum from duplicates
        if (extraVisits > 0) {
          await session.run(
            `MATCH (m:Memory {id: $survivorId})
             SET m.visitCount = coalesce(m.visitCount, 1) + $extraVisits`,
            { survivorId, extraVisits },
          );
        }

        // Step 6: Detach-delete all duplicates (removes all their edges too)
        await session.run(
          `UNWIND $duplicateIds AS dupId
           MATCH (m:Memory {id: dupId})
           DETACH DELETE m`,
          { duplicateIds },
        );

        totalDeleted += duplicateIds.length;
      }

      return totalDeleted;
    });
  }

  /**
   * Diagnostic: find all memories matching a title (case-insensitive) and
   * return their id, title, content (first 100 chars), and contentHash so
   * we can see why hash-based dedup did or didn't group them.
   */
  async diagnoseDuplicates(
    userId: string,
    title: string,
  ): Promise<
    Array<{
      id: string;
      title: string;
      contentPreview: string;
      contentHash: string | null;
      createdAt: string;
    }>
  > {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE toLower(m.title) = toLower($title)
         RETURN m.id AS id,
                m.title AS title,
                left(m.content, 100) AS contentPreview,
                m.contentHash AS contentHash,
                m.createdAt AS createdAt
         ORDER BY m.createdAt ASC`,
        { userId, title },
      );
      return result.records.map((r) => ({
        id: String(r.get("id")),
        title: String(r.get("title")),
        contentPreview: String(r.get("contentPreview")),
        contentHash: r.get("contentHash") ? String(r.get("contentHash")) : null,
        createdAt: String(r.get("createdAt")),
      }));
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Semantic edge backfill helpers
  //
  // Used by the migration in `convex/neo4jActions/migration.ts` to retroactively
  // create embedding-based RELATES_TO edges for memories that existed before
  // auto-linking shipped. Mirrors the embedding backfill pattern.
  // ─────────────────────────────────────────────────────────────────────────────

  /** Return memories with embeddings that haven't been processed for semantic edges yet. */
  async listMissingSemanticEdges(
    limit: number,
  ): Promise<Array<{ id: string; userId: string; embedding: number[] }>> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory)
         WHERE m.embedding IS NOT NULL AND m.semanticEdgesAt IS NULL
         RETURN m.id AS id, m.userId AS userId, m.embedding AS embedding
         ORDER BY m.createdAt DESC
         LIMIT $limit`,
        { limit: neo4j.int(limit) },
      );
      return result.records.map((r) => ({
        id: String(r.get("id")),
        userId: String(r.get("userId")),
        embedding: r.get("embedding") as number[],
      }));
    });
  }

  /** Create semantic similarity edges for a single memory using the vector index. */
  async createSemanticEdgesForMemory(
    memoryId: string,
    userId: string,
    embedding: number[],
  ): Promise<number> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
         YIELD node AS candidate, score AS similarity
         WHERE candidate.userId = $userId
           AND candidate.id <> $id
           AND similarity >= $threshold
         WITH candidate, similarity
         ORDER BY similarity DESC
         LIMIT $limit
         MATCH (m:Memory {id: $id})
         MERGE (m)-[r:RELATES_TO]->(candidate)
         ON CREATE SET r.reason = 'semantic similarity', r.score = similarity
         RETURN count(r) AS created`,
        {
          k: neo4j.int(20),
          embedding,
          userId,
          id: memoryId,
          threshold: 0.78,
          limit: neo4j.int(5),
        },
      );
      const record = result.records[0];
      return record ? toNeoInt(record.get("created")) : 0;
    });
  }

  /** Mark memories as processed for semantic edges so the backfill skips them. */
  async markSemanticEdgesProcessed(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.withSession(async (session) => {
      await session.run(
        `UNWIND $ids AS memId
         MATCH (m:Memory {id: memId})
         SET m.semanticEdgesAt = datetime()`,
        { ids },
      );
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Entity backfill helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /** List memories that have not had entity extraction run yet. */
  async listMissingEntities(limit: number): Promise<
    Array<{
      id: string;
      userId: string;
      profileId: string | null;
      title: string;
      content: string;
    }>
  > {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory)
         WHERE m.entityExtractedAt IS NULL
           AND coalesce(m.status, 'active') IN ['active', 'pinned']
         RETURN m.id AS id, m.userId AS userId, m.profileId AS profileId, m.title AS title, m.content AS content
         ORDER BY m.createdAt DESC
         LIMIT $limit`,
        { limit: neo4j.int(limit) },
      );
      return result.records.map((r) => {
        const rawProfileId = r.get("profileId");
        return {
          id: String(r.get("id")),
          userId: String(r.get("userId")),
          profileId:
            typeof rawProfileId === "string" && rawProfileId.length > 0
              ? rawProfileId
              : null,
          title: String(r.get("title")),
          content: String(r.get("content") ?? ""),
        };
      });
    });
  }

  /** Mark memories as processed for entity extraction. */
  async markEntityExtracted(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.withSession(async (session) => {
      await session.run(
        `UNWIND $ids AS memId
         MATCH (m:Memory {id: memId})
         SET m.entityExtractedAt = datetime()`,
        { ids },
      );
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Graph-augmented retrieval helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Expand from seed memory IDs via 1-2 hops through RELATES_TO and MENTIONS
   * edges. Returns neighbouring memory IDs with their minimum hop distance.
   */
  async expandViaGraph(
    seedIds: string[],
    userId: string,
    limit: number = 50,
  ): Promise<Array<{ id: string; hops: number }>> {
    if (seedIds.length === 0) return [];
    return this.withSession(async (session) => {
      const result = await session.run(
        `// 1-hop: direct RELATES_TO neighbor
         MATCH (seed:Memory {userId: $userId})-[:RELATES_TO]-(neighbor:Memory {userId: $userId})
         WHERE seed.id IN $seedIds AND NOT neighbor.id IN $seedIds
           AND coalesce(neighbor.status, 'active') IN ['active', 'pinned']
         RETURN DISTINCT neighbor.id AS id, 1 AS hops
         UNION
         // 1-hop via entity hub: memory→entity←memory
         MATCH (seed:Memory {userId: $userId})-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(neighbor:Memory {userId: $userId})
         WHERE seed.id IN $seedIds AND NOT neighbor.id IN $seedIds
           AND coalesce(neighbor.status, 'active') IN ['active', 'pinned']
         RETURN DISTINCT neighbor.id AS id, 1 AS hops
         UNION
         // 2-hop: memory→memory→memory
         MATCH (seed:Memory {userId: $userId})-[:RELATES_TO]-(mid:Memory {userId: $userId})-[:RELATES_TO]-(neighbor:Memory {userId: $userId})
         WHERE seed.id IN $seedIds AND NOT neighbor.id IN $seedIds AND NOT mid.id IN $seedIds
           AND coalesce(mid.status, 'active') IN ['active', 'pinned']
           AND coalesce(neighbor.status, 'active') IN ['active', 'pinned']
         RETURN DISTINCT neighbor.id AS id, 2 AS hops`,
        { seedIds, userId },
      );

      // Dedup: keep minimum hop count per memory id
      const hopMap = new Map<string, number>();
      for (const r of result.records) {
        const id = String(r.get("id"));
        const hops = toNeoInt(r.get("hops"));
        const existing = hopMap.get(id);
        if (existing === undefined || hops < existing) {
          hopMap.set(id, hops);
        }
      }
      return Array.from(hopMap.entries())
        .map(([id, hops]) => ({ id, hops }))
        .sort((a, b) => a.hops - b.hops)
        .slice(0, limit);
    });
  }

  /**
   * Batch-fetch memory metadata for graph-discovered IDs that weren't in the
   * initial BM25/vector results. Returns enough data to build MergedEntry.
   */
  async fetchMemoryMetadata(
    ids: string[],
    userId: string,
  ): Promise<Map<string, { memory: MemoryWithTags; ageInDays: number }>> {
    if (ids.length === 0) return new Map();
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE m.id IN $ids
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         WITH m, collect(t.name) AS tags,
              duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
         RETURN m, tags, ageInDays`,
        { ids, userId },
      );
      const map = new Map<
        string,
        { memory: MemoryWithTags; ageInDays: number }
      >();
      for (const r of result.records) {
        const memory = toMemoryWithTags(r);
        const ageInDays = toNeoInt(r.get("ageInDays"));
        map.set(memory.id, { memory, ageInDays });
      }
      return map;
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Dream Mode V2 — background reasoning helpers
  //
  // The Dreamer is an asynchronous worker (daily cron + manual trigger) that
  // scans a profile's recent memories, finds anomalous ones via surprisal
  // scoring (mean cosine distance to k-nearest neighbors), clusters each
  // anomaly with its 1-hop graph neighborhood, and ships each cluster to
  // the LLM for synthesis. The result is a synthesis :ProposedUpdate
  // (insight/connection/contradiction/anomaly) routed through the existing
  // /proposals queue, OR (if the profile has dreamModeAutoAccept) a new
  // :Memory + :DERIVED_FROM edges materialized directly.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch memories created in a given time window for a profile, restricted
   * to those that have an embedding (no embedding ⇒ no surprisal score
   * possible). Used as the candidate pool for Dream Mode synthesis.
   */
  async findRecentMemoriesForDream(params: {
    userId: string;
    profileId: string;
    sinceMs: number;
    limit: number;
  }): Promise<
    Array<{
      id: string;
      title: string;
      content: string;
      embedding: number[];
      createdAt: string;
    }>
  > {
    return this.withSession(async (session) => {
      const sinceIso = new Date(params.sinceMs).toISOString();
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId, profileId: $profileId})
         WHERE m.embedding IS NOT NULL
           AND m.createdAt >= $sinceIso
           AND m.status IN ['active', 'pinned']
         RETURN m.id AS id, m.title AS title, m.content AS content,
                m.embedding AS embedding, m.createdAt AS createdAt
         ORDER BY m.createdAt DESC
         LIMIT $limit`,
        {
          userId: params.userId,
          profileId: params.profileId,
          sinceIso,
          limit: neo4j.int(params.limit),
        },
      );
      return result.records.flatMap((r) => {
        const rawEmbedding: unknown = r.get("embedding");
        if (!Array.isArray(rawEmbedding)) return [];
        const embedding: number[] = rawEmbedding.filter(
          (x: unknown): x is number => typeof x === "number",
        );
        if (embedding.length === 0) return [];
        return [
          {
            id: String(r.get("id")),
            title: String(r.get("title")),
            content: String(r.get("content")),
            embedding,
            createdAt: String(r.get("createdAt")),
          },
        ];
      });
    });
  }

  /**
   * Compute surprisal score for one memory against the user's full memory
   * corpus. surprisal = 1 - mean(cosineSimilarity to k nearest neighbors).
   * Higher = more anomalous = more interesting for the Dreamer to expand on.
   *
   * Uses the existing `memory_embedding` vector index. We request k+1
   * results because the index returns the memory itself as its own closest
   * match (similarity 1.0); we drop that and average the rest.
   *
   * Returns null when fewer than 2 neighbors are available — not enough
   * signal to make a meaningful comparison.
   */
  async computeSurprisalScore(params: {
    userId: string;
    memoryId: string;
    embedding: number[];
    k: number;
  }): Promise<number | null> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
         YIELD node, score
         WHERE node.userId = $userId
           AND node.id <> $memoryId
           AND node.status IN ['active', 'pinned']
         WITH score
         ORDER BY score DESC
         LIMIT $kInner
         RETURN collect(score) AS scores`,
        {
          k: neo4j.int(params.k + 5),
          kInner: neo4j.int(params.k),
          embedding: params.embedding,
          userId: params.userId,
          memoryId: params.memoryId,
        },
      );
      const firstRecord = result.records[0];
      if (!firstRecord) return null;
      const rawScores: unknown = firstRecord.get("scores");
      if (!Array.isArray(rawScores) || rawScores.length < 2) return null;
      const scores: number[] = rawScores.filter(
        (x: unknown): x is number => typeof x === "number",
      );
      if (scores.length < 2) return null;
      const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      return 1 - mean;
    });
  }

  /**
   * For an anomaly memory, fetch its 1-hop graph neighborhood:
   *   - Memories linked via RELATES_TO (either direction)
   *   - Memories that MENTIONS the same entity
   * Caps at `maxClusterSize` neighbors. The anomaly itself is always
   * included as the first element so the LLM has a clear focal point.
   */
  async fetchAnomalyCluster(params: {
    userId: string;
    anomalyId: string;
    maxClusterSize: number;
  }): Promise<
    Array<{
      id: string;
      title: string;
      content: string;
      tags: string[];
      relation: "anomaly" | "related" | "shared-entity";
    }>
  > {
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (a:Memory {id: $anomalyId, userId: $userId})
         OPTIONAL MATCH (a)-[:RELATES_TO]-(rel:Memory {userId: $userId})
           WHERE rel.id <> a.id AND rel.status IN ['active', 'pinned']
         WITH a, collect(DISTINCT rel) AS relMems
         OPTIONAL MATCH (a)-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(em:Memory {userId: $userId})
           WHERE em.id <> a.id AND em.status IN ['active', 'pinned']
         WITH a, relMems, collect(DISTINCT em) AS entityMems
         OPTIONAL MATCH (a)-[:TAGGED_WITH]->(at:Tag)
         WITH a, relMems, entityMems, collect(DISTINCT at.name) AS aTags
         RETURN a, aTags, relMems, entityMems`,
        { userId: params.userId, anomalyId: params.anomalyId },
      );
      const firstRecord = result.records[0];
      if (!firstRecord) return [];

      const aNode = firstRecord.get("a");
      const aTagsRaw: unknown = firstRecord.get("aTags");
      const aTags: string[] = Array.isArray(aTagsRaw)
        ? aTagsRaw.filter((x: unknown): x is string => typeof x === "string")
        : [];

      const cluster: Array<{
        id: string;
        title: string;
        content: string;
        tags: string[];
        relation: "anomaly" | "related" | "shared-entity";
      }> = [
        {
          id: String(aNode.properties.id),
          title: String(aNode.properties.title),
          content: String(aNode.properties.content),
          tags: aTags,
          relation: "anomaly",
        },
      ];

      const seen = new Set<string>([cluster[0]?.id ?? ""]);
      const append = (
        nodes: unknown,
        relation: "related" | "shared-entity",
      ): void => {
        if (!Array.isArray(nodes)) return;
        for (const n of nodes) {
          if (cluster.length >= params.maxClusterSize) return;
          if (typeof n !== "object" || n === null) continue;
          const props = Reflect.get(n, "properties");
          if (typeof props !== "object" || props === null) continue;
          const id = Reflect.get(props, "id");
          const title = Reflect.get(props, "title");
          const content = Reflect.get(props, "content");
          if (
            typeof id !== "string" ||
            typeof title !== "string" ||
            typeof content !== "string"
          ) {
            continue;
          }
          if (seen.has(id)) continue;
          seen.add(id);
          cluster.push({ id, title, content, tags: [], relation });
        }
      };

      append(firstRecord.get("relMems"), "related");
      append(firstRecord.get("entityMems"), "shared-entity");

      return cluster;
    });
  }

  /**
   * Dedup check: returns true if a pending proposal already exists whose
   * sourceMemoryIds overlap by at least `overlapThreshold` (default 0.5)
   * with the candidate. Prevents the Dreamer from re-proposing the same
   * insight on consecutive runs.
   */
  async hasOverlappingPendingProposal(params: {
    userId: string;
    sourceMemoryIds: string[];
    overlapThreshold: number;
  }): Promise<boolean> {
    if (params.sourceMemoryIds.length === 0) return false;
    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (p:ProposedUpdate {status: 'pending'})
         WHERE p.source = 'dream-mode'
           AND p.sourceMemoryIds IS NOT NULL
           AND size(p.sourceMemoryIds) > 0
         WITH p,
              [x IN p.sourceMemoryIds WHERE x IN $candidateIds] AS overlap,
              p.sourceMemoryIds AS existing
         WITH p, size(overlap) AS overlapCount, size(existing) AS existingSize
         WHERE overlapCount > 0
           AND (toFloat(overlapCount) / toFloat(existingSize)) >= $threshold
         WITH p
         MATCH (m:Memory {userId: $userId})
         WHERE m.id IN p.sourceMemoryIds
         RETURN p.id AS id
         LIMIT 1`,
        {
          candidateIds: params.sourceMemoryIds,
          threshold: params.overlapThreshold,
          userId: params.userId,
        },
      );
      return result.records.length > 0;
    });
  }

  /**
   * Create a synthesis :ProposedUpdate (insight/connection/contradiction/anomaly).
   * Synthesis proposals carry their own title and a sourceMemoryIds list — they
   * are NOT bound via UPDATE_FOR to a single memory like update/delete proposals.
   * The proposals UI uses sourceMemoryIds + sourceMemorySnapshots to render the
   * "derived from" panel.
   */
  async createSynthesisProposal(params: {
    userId: string;
    kind: "insight" | "connection" | "contradiction" | "anomaly";
    proposedTitle: string;
    proposedContent: string;
    reason: string;
    sourceMemoryIds: string[];
    confidence: number;
  }): Promise<ProposedUpdateNode> {
    return this.withSession(async (session) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      // primaryMemoryId is used for the legacy `memoryId` field so existing
      // queries that look up "proposals affecting memory X" still surface
      // synthesis proposals where X is one of the sources. Picks the first
      // source by convention.
      const primaryMemoryId = params.sourceMemoryIds[0] ?? "";

      const result = await session.run(
        `CREATE (p:ProposedUpdate {
           id: $id,
           memoryId: $primaryMemoryId,
           proposedTitle: $proposedTitle,
           proposedContent: $proposedContent,
           reason: $reason,
           kind: $kind,
           status: 'pending',
           createdAt: $now,
           resolvedAt: null,
           sourceMemoryIds: $sourceMemoryIds,
           confidence: $confidence,
           source: 'dream-mode'
         })
         WITH p
         UNWIND $sourceMemoryIds AS sid
         MATCH (m:Memory {id: sid, userId: $userId})
         MERGE (p)-[:DERIVED_FROM]->(m)
         RETURN p`,
        {
          id,
          primaryMemoryId,
          proposedTitle: params.proposedTitle,
          proposedContent: params.proposedContent,
          reason: params.reason,
          kind: params.kind,
          now,
          sourceMemoryIds: params.sourceMemoryIds,
          confidence: params.confidence,
          userId: params.userId,
        },
      );

      const firstRecord = result.records[0];
      if (!firstRecord) {
        throw new Error("Failed to create synthesis proposal");
      }

      return {
        id,
        memoryId: primaryMemoryId,
        proposedContent: params.proposedContent,
        proposedTitle: params.proposedTitle,
        reason: params.reason,
        kind: params.kind,
        status: "pending",
        createdAt: now,
        resolvedAt: null,
        sourceMemoryIds: params.sourceMemoryIds,
        confidence: params.confidence,
        source: "dream-mode",
        memorySnapshot: null,
        sourceMemorySnapshots: [],
      };
    });
  }

  /**
   * Auto-accept path: directly create a new :Memory of type 'knowledge'
   * with `source: 'dream-mode'` and :DERIVED_FROM edges to each source.
   * Used when the profile has `dreamModeAutoAccept = true`.
   *
   * Mirrors `createMemory` but skips the same-session/same-domain edge
   * scaffolding (synthesis memories aren't from a "session") and skips
   * the URL/file-upload metadata.
   */
  async materializeSynthesisAsMemory(params: {
    userId: string;
    profileId: string;
    title: string;
    content: string;
    embedding: number[] | null;
    contentHash: string;
    sourceMemoryIds: string[];
    confidence: number;
  }): Promise<{ id: string }> {
    return this.withSession(async (session) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await session.run(
        `CREATE (m:Memory {
           id: $id,
           userId: $userId,
           profileId: $profileId,
           title: $title,
           content: $content,
           type: 'knowledge',
           source: 'dream-mode',
           confidence: $confidence,
           status: 'active',
           createdAt: $now,
           updatedAt: $now,
           expiresAt: null,
           url: null,
           embedding: $embedding,
           contentHash: $contentHash,
           sourceType: null,
           sourceId: null,
           storageId: null,
           mimeType: null,
           originalFilename: null,
           visitCount: 1,
           firstVisitAt: $now,
           lastVisitAt: $now
         })
         WITH m
         MERGE (s:Source {name: 'dream-mode'})
         CREATE (m)-[:FROM_SOURCE]->(s)
         WITH m
         UNWIND $sourceMemoryIds AS sid
         MATCH (src:Memory {id: sid, userId: $userId})
         MERGE (m)-[:DERIVED_FROM]->(src)`,
        {
          id,
          userId: params.userId,
          profileId: params.profileId,
          title: params.title,
          content: params.content,
          confidence: params.confidence,
          now,
          embedding: params.embedding,
          contentHash: params.contentHash,
          sourceMemoryIds: params.sourceMemoryIds,
        },
      );

      await this.logEvent(
        session,
        id,
        "created",
        "dream-mode",
        { type: "knowledge", autoAccepted: "true" },
        toSnapshot({
          title: params.title,
          content: params.content,
          type: "knowledge",
          status: "active",
          confidence: params.confidence,
          tags: [],
        }),
      );

      return { id };
    });
  }
}
