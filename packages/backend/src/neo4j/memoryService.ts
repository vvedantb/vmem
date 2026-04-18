import neo4j, {
  type Driver,
  type Integer,
  type Session,
  type Record as NeoRecord,
} from "neo4j-driver";
import Cypher, { type RawCypherContext } from "@neo4j/cypher-builder";
import crypto from "node:crypto";
import { buildAndRun } from "./cypherHelpers";

type MemoryType = "profile" | "episodic" | "knowledge";
type MemoryStatus = "active" | "pinned" | "suppressed" | "expired";

interface MemoryNode {
  id: string;
  userId: string;
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

function computeTagEdges(
  nodes: ReadonlyArray<{ id: string; tags: string[] }>,
  limit: number,
): TagEdge[] {
  const tagIndex = new Map<string, string[]>();
  for (const node of nodes) {
    for (const tag of node.tags) {
      let ids = tagIndex.get(tag);
      if (!ids) {
        ids = [];
        tagIndex.set(tag, ids);
      }
      ids.push(node.id);
    }
  }

  const edgeMap = new Map<string, { weight: number; sharedTags: string[] }>();
  for (const [tag, ids] of tagIndex) {
    if (ids.length > 500) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        if (!a || !b) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        let entry = edgeMap.get(key);
        if (!entry) {
          entry = { weight: 0, sharedTags: [] };
          edgeMap.set(key, entry);
        }
        entry.weight++;
        if (entry.sharedTags.length < 5) {
          entry.sharedTags.push(tag);
        }
      }
    }
  }

  const edges: TagEdge[] = [];
  for (const [key, data] of edgeMap) {
    if (data.weight < 2) continue;
    const sep = key.indexOf("|");
    edges.push({
      source: key.slice(0, sep),
      target: key.slice(sep + 1),
      weight: data.weight,
      sharedTags: data.sharedTags,
    });
  }
  edges.sort((a, b) => b.weight - a.weight);
  return edges.slice(0, limit);
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
    title: string;
    content: string;
    type: MemoryType;
    source: string;
    tags: string[];
    confidence: number;
    expiresAt?: string;
    url?: string;
  }): Promise<MemoryWithTags> {
    return this.withSession(async (session) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const result = await session.run(
        `CREATE (m:Memory {
          id: $id,
          userId: $userId,
          title: $title,
          content: $content,
          type: $type,
          source: $source,
          confidence: $confidence,
          status: 'active',
          createdAt: $now,
          updatedAt: $now,
          expiresAt: $expiresAt,
          url: $url
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
          title: params.title,
          content: params.content,
          type: params.type,
          source: params.source,
          confidence: params.confidence,
          tags: params.tags,
          now,
          expiresAt: params.expiresAt ?? null,
          url: params.url ?? null,
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
   * Upsert a memory from an external source (Google Drive, Notion, etc.)
   * Uses MERGE on (userId, sourceType, sourceId) to avoid duplicates.
   * Creates new memory if not exists, updates content if exists.
   */
  async upsertFromSource(params: {
    userId: string;
    title: string;
    content: string;
    sourceType: string;
    sourceId: string;
    sourceUrl: string;
  }): Promise<{ id: string; created: boolean }> {
    return this.withSession(async (session) => {
      const now = new Date().toISOString();

      const result = await session.run(
        `MERGE (m:Memory {userId: $userId, sourceType: $sourceType, sourceId: $sourceId})
         ON CREATE SET
           m.id = $newId,
           m.title = $title,
           m.content = $content,
           m.type = 'knowledge',
           m.source = $sourceType,
           m.confidence = 0.8,
           m.status = 'active',
           m.createdAt = $now,
           m.updatedAt = $now,
           m.sourceUrl = $sourceUrl,
           m.sourceSyncedAt = $now
         ON MATCH SET
           m.title = $title,
           m.content = $content,
           m.updatedAt = $now,
           m.sourceUrl = $sourceUrl,
           m.sourceSyncedAt = $now
         WITH m, m.createdAt = $now AS wasCreated
         MERGE (s:Source {name: $sourceType})
         MERGE (m)-[:FROM_SOURCE]->(s)
         RETURN m.id AS id, wasCreated`,
        {
          userId: params.userId,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          sourceUrl: params.sourceUrl,
          title: params.title,
          content: params.content,
          newId: crypto.randomUUID(),
          now,
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
    type?: MemoryType;
    status?: MemoryStatus;
    tags?: string[];
    limit: number;
    offset: number;
  }): Promise<{ memories: MemoryWithTags[]; total: number }> {
    return this.withSession(async (session) => {
      const whereClauses = ["m.userId = $userId"];
      const queryParams: Record<string, string | number | Integer | string[]> =
        {
          userId: params.userId,
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
      if (params.tags && params.tags.length > 0) {
        whereClauses.push(
          `size([(m)-[:TAGGED_WITH]->(ft:Tag) WHERE ft.name IN $filterTags | ft]) = size($filterTags)`,
        );
        queryParams.filterTags = params.tags;
      }

      const where = whereClauses.join(" AND ");

      const countResult = await session.run(
        `MATCH (m:Memory) WHERE ${where} RETURN count(m) AS total`,
        queryParams,
      );
      const countRecord = countResult.records[0];
      const total = countRecord ? toNeoInt(countRecord.get("total")) : 0;

      const result = await session.run(
        `MATCH (m:Memory) WHERE ${where}
         WITH m ORDER BY m.createdAt DESC SKIP $offset LIMIT $limit
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
      const mVar = new Cypher.Variable();
      const m = new Cypher.Node({ variable: mVar });
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
          ? new Cypher.Raw((ctx: RawCypherContext) => [
              `WITH ${ctx.compile(mVar)}
OPTIONAL MATCH (${ctx.compile(mVar)})-[r:TAGGED_WITH]->(:Tag)
DELETE r
WITH ${ctx.compile(mVar)}
UNWIND $newTags AS tagName
MERGE (tag:Tag {name: tagName})
CREATE (${ctx.compile(mVar)})-[:TAGGED_WITH]->(tag)`,
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
    query?: string;
    type?: MemoryType;
    tags?: string[];
    source?: string;
    limit: number;
    offset: number;
  }): Promise<{ memories: MemoryWithTags[]; total: number }> {
    if (!params.query) return this.listMemories(params);

    return this.withSession(async (session) => {
      const result = await session.run(
        `CALL db.index.fulltext.queryNodes('memory_content', $query)
         YIELD node AS m, score
         WHERE m.userId = $userId
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         RETURN m, collect(t.name) AS tags, score
         ORDER BY score DESC
         SKIP $offset LIMIT $limit`,
        {
          query: params.query,
          userId: params.userId,
          offset: neo4j.int(params.offset),
          limit: neo4j.int(params.limit),
        },
      );

      const memories = result.records.map(toMemoryWithTags);
      return { memories, total: memories.length };
    });
  }

  async retrieveMemories(params: {
    userId: string;
    query: string;
    type?: MemoryType;
    tags?: string[];
    limit: number;
  }): Promise<MemoryCandidate[]> {
    return this.withSession(async (session) => {
      const result = await session.run(
        `CALL db.index.fulltext.queryNodes('memory_content', $query)
         YIELD node AS m, score AS fulltextScore
         WHERE m.userId = $userId
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         WITH m, collect(t.name) AS tags, fulltextScore,
              duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
         WITH m, tags, fulltextScore,
              CASE WHEN ageInDays < 1 THEN 1.0
                   WHEN ageInDays < 7 THEN 0.9
                   WHEN ageInDays < 30 THEN 0.7
                   WHEN ageInDays < 90 THEN 0.5
                   ELSE 0.3 END AS recencyScore,
              m.confidence AS confidenceScore
         WITH m, tags, fulltextScore, recencyScore, confidenceScore,
              (fulltextScore * 0.5 + recencyScore * 0.25 + confidenceScore * 0.25) AS totalScore
         RETURN m, tags, fulltextScore, recencyScore, confidenceScore, totalScore
         ORDER BY totalScore DESC
         LIMIT $limit`,
        {
          query: params.query,
          userId: params.userId,
          limit: neo4j.int(params.limit),
        },
      );

      return result.records.map((record) => {
        const memory = toMemoryWithTags(record);
        const fulltextScore = Number(record.get("fulltextScore"));
        const recencyScore = Number(record.get("recencyScore"));
        const confidenceScore = Number(record.get("confidenceScore"));
        const totalScore = Number(record.get("totalScore"));

        const reasons: string[] = [];
        if (fulltextScore > 0.5) reasons.push("strong content match");
        if (recencyScore > 0.8) reasons.push("recently created");
        if (confidenceScore > 0.8) reasons.push("high confidence source");
        if (memory.status === "pinned") reasons.push("pinned by user");

        return {
          ...memory,
          trace: {
            score: totalScore,
            scoreBreakdown: {
              fulltext: fulltextScore,
              recency: recencyScore,
              confidence: confidenceScore,
            },
            reason:
              reasons.length > 0
                ? `Matched because: ${reasons.join(", ")}`
                : "Weak match across all signals",
          },
        };
      });
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

  async getStats(userId: string): Promise<{
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

      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WITH count(m) AS total,
              count(CASE WHEN m.createdAt >= $weekAgo THEN 1 END) AS thisWeek,
              count(CASE WHEN m.createdAt >= $monthAgo THEN 1 END) AS thisMonth,
              count(CASE WHEN m.createdAt >= $todayStart THEN 1 END) AS today
         OPTIONAL MATCH (t:Tag)<-[:TAGGED_WITH]-(:Memory {userId: $userId})
         WITH total, thisWeek, thisMonth, today, count(DISTINCT t) AS tagCount
         RETURN total, thisWeek, thisMonth, today, tagCount`,
        {
          userId,
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

      const growthResult = await session.run(
        `WITH range(0, 6) AS days
         UNWIND days AS dayOffset
         WITH date() - duration({days: dayOffset}) AS d
         OPTIONAL MATCH (m:Memory {userId: $userId})
           WHERE date(datetime(m.createdAt)) <= d
         WITH d, count(m) AS total
         OPTIONAL MATCH (m2:Memory {userId: $userId})
           WHERE date(datetime(m2.createdAt)) = d
         WITH d, total, count(m2) AS newCount
         RETURN toString(d) AS date, total, newCount
         ORDER BY d ASC`,
        { userId },
      );

      const growthData = growthResult.records.map((r) => {
        const dateStr = String(r.get("date"));
        const d = new Date(dateStr);
        const label = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        return {
          date: label,
          total: toNeoInt(r.get("total")),
          new: toNeoInt(r.get("newCount")),
        };
      });

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
      const result = await session.run(
        `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
         RETURN e, m.title AS memoryTitle
         ORDER BY e.createdAt DESC
         LIMIT $limit`,
        { userId, limit: neo4j.int(limit) },
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

  async getGraphData(userId: string): Promise<{
    nodes: {
      id: string;
      title: string;
      content: string;
      tags: string[];
      createdAt: string;
    }[];
    relatesToEdges: { source: string; target: string; reason: string }[];
    tagEdges: {
      source: string;
      target: string;
      weight: number;
      sharedTags: string[];
    }[];
  }> {
    const nodesSession = this.driver.session();
    const relatesToSession = this.driver.session();
    try {
      const [nodesResult, relatesToResult] = await Promise.all([
        nodesSession.run(
          `MATCH (m:Memory {userId: $userId})
           WHERE coalesce(m.status, 'active') IN ['active', 'pinned']
           OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
           RETURN m.id AS id, m.title AS title,
                  substring(m.content, 0, 200) AS content,
                  collect(t.name) AS tags,
                  m.createdAt AS createdAt`,
          { userId },
        ),
        relatesToSession.run(
          `MATCH (a:Memory {userId: $userId})-[r:RELATES_TO]->(b:Memory {userId: $userId})
           WHERE coalesce(a.status, 'active') IN ['active', 'pinned']
             AND coalesce(b.status, 'active') IN ['active', 'pinned']
           RETURN a.id AS source, b.id AS target, r.reason AS reason`,
          { userId },
        ),
      ]);

      const nodes = nodesResult.records.map((r) => ({
        id: String(r.get("id")),
        title: String(r.get("title")),
        content: String(r.get("content") ?? ""),
        tags: Array.isArray(r.get("tags"))
          ? r.get("tags").filter(Boolean).map(String)
          : [],
        createdAt: String(r.get("createdAt")),
      }));

      const relatesToEdges = relatesToResult.records.map((r) => ({
        source: String(r.get("source")),
        target: String(r.get("target")),
        reason: String(r.get("reason") ?? ""),
      }));

      const tagEdges = computeTagEdges(nodes, 5000);

      return { nodes, relatesToEdges, tagEdges };
    } finally {
      await Promise.all([nodesSession.close(), relatesToSession.close()]);
    }
  }

  async getLocalGraph(
    userId: string,
    focusId: string,
  ): Promise<ReturnType<MemoryService["getGraphData"]>> {
    const nodesSession = this.driver.session();
    let nodeIds: string[];
    let nodes: {
      id: string;
      title: string;
      content: string;
      tags: string[];
      createdAt: string;
    }[];

    try {
      const nodesResult = await nodesSession.run(
        `MATCH (focus:Memory {id: $focusId, userId: $userId})
         WHERE coalesce(focus.status, 'active') IN ['active', 'pinned']
         OPTIONAL MATCH (focus)-[:RELATES_TO*1..2]-(neighbor:Memory {userId: $userId})
         WHERE coalesce(neighbor.status, 'active') IN ['active', 'pinned']
         WITH focus, collect(DISTINCT neighbor) AS neighbors
         WITH [focus] + neighbors AS allNodes
         UNWIND allNodes AS m
         WITH DISTINCT m
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         RETURN m.id AS id, m.title AS title,
                substring(m.content, 0, 200) AS content,
                collect(t.name) AS tags, m.createdAt AS createdAt
         LIMIT 500`,
        { userId, focusId },
      );

      nodes = nodesResult.records.map((r) => ({
        id: String(r.get("id")),
        title: String(r.get("title")),
        content: String(r.get("content") ?? ""),
        tags: Array.isArray(r.get("tags"))
          ? r.get("tags").filter(Boolean).map(String)
          : [],
        createdAt: String(r.get("createdAt")),
      }));
      nodeIds = nodes.map((n) => n.id);
    } finally {
      await nodesSession.close();
    }

    if (nodeIds.length === 0) {
      return { nodes: [], relatesToEdges: [], tagEdges: [] };
    }

    const relatesToSession = this.driver.session();
    try {
      const relatesToResult = await relatesToSession.run(
        `MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
         WHERE a.id IN $nodeIds AND b.id IN $nodeIds
         RETURN a.id AS source, b.id AS target, r.reason AS reason`,
        { nodeIds },
      );

      const relatesToEdges = relatesToResult.records.map((r) => ({
        source: String(r.get("source")),
        target: String(r.get("target")),
        reason: String(r.get("reason") ?? ""),
      }));

      const tagEdges = computeTagEdges(nodes, 2000);

      return { nodes, relatesToEdges, tagEdges };
    } finally {
      await relatesToSession.close();
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
    await session.run(
      `MATCH (m:Memory {id: $memoryId})
       CREATE (e:MemoryEvent {
         id: randomUUID(),
         action: $action,
         actor: $actor,
         details: $details,
         snapshot: $snapshot,
         createdAt: $now
       })
       CREATE (e)-[:EVENT_FOR]->(m)`,
      {
        memoryId,
        action,
        actor,
        details: JSON.stringify(details),
        snapshot,
        now: new Date().toISOString(),
      },
    );
  }
}
