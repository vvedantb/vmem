import neo4j, { Driver } from "neo4j-driver";
import crypto from "node:crypto";

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

function parseJsonField<T>(val: unknown): T | null {
  if (typeof val !== "string") return null;
  return JSON.parse(val);
}

function toEventFromNode(props: Record<string, unknown>): MemoryEvent {
  const snapshot = parseJsonField<MemorySnapshot>(props.snapshot);
  const details = parseJsonField<Record<string, string>>(props.details);
  return {
    id: String(props.id ?? ""),
    action: String(props.action ?? ""),
    actor: String(props.actor ?? ""),
    createdAt: String(props.createdAt ?? ""),
    snapshot,
    details,
  };
}

function toMemoryWithTags(record: Record<string, unknown>): MemoryWithTags {
  const m = record.m as Record<string, unknown>;
  const props = (m as { properties: Record<string, unknown> }).properties;
  const tags = record.tags as string[];
  return {
    id: props.id as string,
    userId: props.userId as string,
    title: props.title as string,
    content: props.content as string,
    type: props.type as MemoryType,
    source: props.source as string,
    confidence: props.confidence as number,
    status: props.status as MemoryStatus,
    createdAt: props.createdAt as string,
    updatedAt: props.updatedAt as string,
    expiresAt: (props.expiresAt as string) ?? null,
    tags,
  };
}

export class MemoryService {
  constructor(private driver: Driver) {}

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
    const session = this.driver.session();
    try {
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

      const snapshot = JSON.stringify({
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
        {
          type: params.type,
        },
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

      const record = result.records[0];
      return toMemoryWithTags(record.toObject());
    } finally {
      await session.close();
    }
  }

  async findMemoryByUrl(
    userId: string,
    url: string,
  ): Promise<{ id: string; title: string; updatedAt: string } | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId, url: $url})
         WHERE m.status IN ['active', 'pinned']
         RETURN m.id AS id, m.title AS title, m.updatedAt AS updatedAt
         LIMIT 1`,
        { userId, url },
      );
      if (result.records.length === 0) return null;
      const r = result.records[0];
      return {
        id: String(r.get("id")),
        title: String(r.get("title")),
        updatedAt: String(r.get("updatedAt")),
      };
    } finally {
      await session.close();
    }
  }

  async getMemory(
    userId: string,
    memoryId: string,
  ): Promise<MemoryWithTags | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         RETURN m, collect(t.name) AS tags`,
        { memoryId, userId },
      );

      if (result.records.length === 0) return null;
      return toMemoryWithTags(result.records[0].toObject());
    } finally {
      await session.close();
    }
  }

  async listMemories(params: {
    userId: string;
    type?: MemoryType;
    status?: MemoryStatus;
    tags?: string[];
    limit: number;
    offset: number;
  }): Promise<{ memories: MemoryWithTags[]; total: number }> {
    const session = this.driver.session();
    try {
      const conditions = ["m.userId = $userId"];
      const queryParams: Record<string, unknown> = {
        userId: params.userId,
        limit: neo4j.int(params.limit),
        offset: neo4j.int(params.offset),
      };

      if (params.type) {
        conditions.push("m.type = $type");
        queryParams.type = params.type;
      }
      if (params.status) {
        conditions.push("m.status = $status");
        queryParams.status = params.status;
      }

      const where = conditions.join(" AND ");

      let tagMatch = "";
      if (params.tags && params.tags.length > 0) {
        tagMatch =
          "MATCH (m)-[:TAGGED_WITH]->(ft:Tag) WHERE ft.name IN $filterTags WITH m WHERE count { (m)-[:TAGGED_WITH]->(ft2:Tag) WHERE ft2.name IN $filterTags } = size($filterTags)";
        queryParams.filterTags = params.tags;
      }

      const countResult = await session.run(
        `MATCH (m:Memory) WHERE ${where} ${tagMatch} RETURN count(m) AS total`,
        queryParams,
      );

      const total = (
        countResult.records[0].get("total") as { toNumber: () => number }
      ).toNumber();

      const result = await session.run(
        `MATCH (m:Memory) WHERE ${where}
         ${tagMatch}
         WITH m ORDER BY m.createdAt DESC
         SKIP $offset LIMIT $limit
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         RETURN m, collect(t.name) AS tags`,
        queryParams,
      );

      const memories = result.records.map((r) =>
        toMemoryWithTags(r.toObject()),
      );
      return { memories, total };
    } finally {
      await session.close();
    }
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
    const session = this.driver.session();
    try {
      const setClauses: string[] = ["m.updatedAt = $now"];
      const queryParams: Record<string, unknown> = {
        memoryId,
        userId,
        now: new Date().toISOString(),
      };

      if (updates.title !== undefined) {
        setClauses.push("m.title = $title");
        queryParams.title = updates.title;
      }
      if (updates.content !== undefined) {
        setClauses.push("m.content = $content");
        queryParams.content = updates.content;
      }
      if (updates.type !== undefined) {
        setClauses.push("m.type = $type");
        queryParams.type = updates.type;
      }
      if (updates.status !== undefined) {
        setClauses.push("m.status = $status");
        queryParams.status = updates.status;
      }
      if (updates.confidence !== undefined) {
        setClauses.push("m.confidence = $confidence");
        queryParams.confidence = updates.confidence;
      }
      if (updates.expiresAt !== undefined) {
        setClauses.push("m.expiresAt = $expiresAt");
        queryParams.expiresAt = updates.expiresAt;
      }

      let tagUpdate = "";
      if (updates.tags !== undefined) {
        tagUpdate = `
          WITH m
          OPTIONAL MATCH (m)-[r:TAGGED_WITH]->(:Tag)
          DELETE r
          WITH m
          UNWIND $newTags AS tagName
          MERGE (t:Tag {name: tagName})
          CREATE (m)-[:TAGGED_WITH]->(t)`;
        queryParams.newTags = updates.tags;
      }

      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         SET ${setClauses.join(", ")}
         ${tagUpdate}
         WITH m
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         RETURN m, collect(t.name) AS tags`,
        queryParams,
      );

      if (result.records.length === 0) return null;

      const updated = toMemoryWithTags(result.records[0].toObject());

      const snapshot = JSON.stringify({
        title: updated.title,
        content: updated.content,
        type: updated.type,
        status: updated.status,
        confidence: updated.confidence,
        tags: updated.tags,
      });

      await this.logEvent(session, memoryId, "updated", "api", {}, snapshot);

      return updated;
    } finally {
      await session.close();
    }
  }

  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         DETACH DELETE m
         RETURN count(m) AS deleted`,
        { memoryId, userId },
      );

      const deleted = (
        result.records[0].get("deleted") as { toNumber: () => number }
      ).toNumber();
      return deleted > 0;
    } finally {
      await session.close();
    }
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
    const session = this.driver.session();
    try {
      if (params.query) {
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

        const memories = result.records.map((r) =>
          toMemoryWithTags(r.toObject()),
        );
        return { memories, total: memories.length };
      }

      return this.listMemories(params);
    } finally {
      await session.close();
    }
  }

  async retrieveMemories(params: {
    userId: string;
    query: string;
    type?: MemoryType;
    tags?: string[];
    limit: number;
  }): Promise<MemoryCandidate[]> {
    const session = this.driver.session();
    try {
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
        const obj = record.toObject();
        const memory = toMemoryWithTags(obj);
        const fulltextScore = obj.fulltextScore as number;
        const recencyScore = obj.recencyScore as number;
        const confidenceScore = obj.confidenceScore as number;
        const totalScore = obj.totalScore as number;

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
    } finally {
      await session.close();
    }
  }

  async getMemoryEvents(
    userId: string,
    memoryId: string,
  ): Promise<MemoryEvent[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})<-[:EVENT_FOR]-(e:MemoryEvent)
         RETURN e
         ORDER BY e.createdAt DESC`,
        { memoryId, userId },
      );

      return result.records.map((record) =>
        toEventFromNode(record.get("e").properties),
      );
    } finally {
      await session.close();
    }
  }

  async createProposedUpdate(params: {
    memoryId: string;
    proposedContent: string;
    reason: string;
  }): Promise<ProposedUpdateNode> {
    const session = this.driver.session();
    try {
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

      const props = result.records[0].get("p").properties;
      return {
        id: props.id,
        memoryId: props.memoryId,
        proposedContent: props.proposedContent,
        reason: props.reason,
        status: props.status,
        createdAt: props.createdAt,
        resolvedAt: null,
      };
    } finally {
      await session.close();
    }
  }

  async listProposedUpdates(userId: string): Promise<ProposedUpdateNode[]> {
    const session = this.driver.session();
    try {
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
    } finally {
      await session.close();
    }
  }

  async resolveProposal(
    proposalId: string,
    action: "approve" | "reject",
  ): Promise<{ status: string; memoryId: string } | null> {
    const session = this.driver.session();
    try {
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
        const record = result.records[0];
        const memory = toMemoryWithTags(record.toObject());

        const snapshot = JSON.stringify({
          title: memory.title,
          content: memory.content,
          type: memory.type,
          status: memory.status,
          confidence: memory.confidence,
          tags: memory.tags,
        });

        await this.logEvent(
          session,
          memory.id,
          "proposal_approved",
          "api",
          {},
          snapshot,
        );

        return {
          status: record.get("status"),
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
      const memoryId = record.get("memoryId") as string;

      await this.logEvent(
        session,
        memoryId,
        "proposal_rejected",
        "api",
        {},
        null,
      );

      return {
        status: record.get("status"),
        memoryId,
      };
    } finally {
      await session.close();
    }
  }

  async getStats(userId: string): Promise<{
    totalMemories: number;
    memoriesThisWeek: number;
    memoriesThisMonth: number;
    totalTags: number;
    growthData: { date: string; total: number; new: number }[];
  }> {
    const session = this.driver.session();
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WITH collect(m) AS allMems
         UNWIND allMems AS m
         WITH allMems,
              count(m) AS total,
              count(CASE WHEN m.createdAt >= $weekAgo THEN 1 END) AS thisWeek,
              count(CASE WHEN m.createdAt >= $monthAgo THEN 1 END) AS thisMonth
         WITH total, thisWeek, thisMonth
         OPTIONAL MATCH (t:Tag)<-[:TAGGED_WITH]-(:Memory {userId: $userId})
         WITH total, thisWeek, thisMonth, count(DISTINCT t) AS tagCount
         RETURN total, thisWeek, thisMonth, tagCount`,
        {
          userId,
          weekAgo: weekAgo.toISOString(),
          monthAgo: monthAgo.toISOString(),
        },
      );

      let totalMemories = 0;
      let memoriesThisWeek = 0;
      let memoriesThisMonth = 0;
      let totalTags = 0;

      if (result.records.length > 0) {
        const record = result.records[0];
        totalMemories = (record.get("total") as { toNumber?: () => number })
          .toNumber
          ? (record.get("total") as { toNumber: () => number }).toNumber()
          : (record.get("total") as number);
        memoriesThisWeek = (
          record.get("thisWeek") as { toNumber?: () => number }
        ).toNumber
          ? (record.get("thisWeek") as { toNumber: () => number }).toNumber()
          : (record.get("thisWeek") as number);
        memoriesThisMonth = (
          record.get("thisMonth") as { toNumber?: () => number }
        ).toNumber
          ? (record.get("thisMonth") as { toNumber: () => number }).toNumber()
          : (record.get("thisMonth") as number);
        totalTags = (record.get("tagCount") as { toNumber?: () => number })
          .toNumber
          ? (record.get("tagCount") as { toNumber: () => number }).toNumber()
          : (record.get("tagCount") as number);
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
        const dateStr = r.get("date") as string;
        const d = new Date(dateStr);
        const label = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        const t = r.get("total");
        const n = r.get("newCount");
        return {
          date: label,
          total:
            typeof t === "number"
              ? t
              : (t as { toNumber: () => number }).toNumber(),
          new:
            typeof n === "number"
              ? n
              : (n as { toNumber: () => number }).toNumber(),
        };
      });

      return {
        totalMemories,
        memoriesThisWeek,
        memoriesThisMonth,
        totalTags,
        growthData,
      };
    } finally {
      await session.close();
    }
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
    const session = this.driver.session();
    try {
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
        const memoryTitle = record.get("memoryTitle") as string;
        const action = props.action as string;
        const createdAt = props.createdAt as string;
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
          id: props.id as string,
          type: typeMap[action] ?? action,
          title: "Memory",
          description: descMap[action] ?? `${action} "${memoryTitle}"`,
          timestamp: createdAt,
          relativeTime,
        };
      });
    } finally {
      await session.close();
    }
  }

  async getMemoryTimeline(
    userId: string,
    memoryId: string,
  ): Promise<TimelineEvent[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {id: $memoryId, userId: $userId})
         RETURN e, m.id AS memoryId, m.title AS memoryTitle
         ORDER BY e.createdAt ASC`,
        { memoryId, userId },
      );

      return result.records.map((record) => ({
        ...toEventFromNode(record.get("e").properties),
        memoryId: String(record.get("memoryId") ?? ""),
        memoryTitle: String(record.get("memoryTitle") ?? ""),
      }));
    } finally {
      await session.close();
    }
  }

  async getTopicTimeline(
    userId: string,
    tag: string,
    limit: number,
    offset: number,
  ): Promise<TimelineEvent[]> {
    const session = this.driver.session();
    try {
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

      return result.records.map((record) => ({
        ...toEventFromNode(record.get("e").properties),
        memoryId: String(record.get("memoryId") ?? ""),
        memoryTitle: String(record.get("memoryTitle") ?? ""),
        connectionType:
          String(record.get("connectionType") ?? "") === "related"
            ? "related"
            : "tag",
      }));
    } finally {
      await session.close();
    }
  }

  async getSearchTimeline(
    userId: string,
    query: string,
    limit: number,
    offset: number,
  ): Promise<TimelineEvent[]> {
    const session = this.driver.session();
    try {
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

      return result.records.map((record) => ({
        ...toEventFromNode(record.get("e").properties),
        memoryId: String(record.get("memoryId") ?? ""),
        memoryTitle: String(record.get("memoryTitle") ?? ""),
      }));
    } finally {
      await session.close();
    }
  }

  async linkMemories(
    userId: string,
    memoryIdA: string,
    memoryIdB: string,
    reason: string,
  ): Promise<boolean> {
    if (memoryIdA === memoryIdB) return false;
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (a:Memory {id: $memoryIdA, userId: $userId}), (b:Memory {id: $memoryIdB, userId: $userId})
         MERGE (a)-[r:RELATES_TO]->(b)
         SET r.reason = $reason
         RETURN a, b`,
        { memoryIdA, memoryIdB, userId, reason },
      );
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  async unlinkMemories(
    userId: string,
    memoryIdA: string,
    memoryIdB: string,
  ): Promise<boolean> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (a:Memory {id: $memoryIdA, userId: $userId})-[r:RELATES_TO]-(b:Memory {id: $memoryIdB, userId: $userId})
         DELETE r`,
        { memoryIdA, memoryIdB, userId },
      );
      return true;
    } finally {
      await session.close();
    }
  }

  async getRelatedMemories(
    userId: string,
    memoryId: string,
  ): Promise<{ memory: MemoryWithTags; reason: string }[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})-[r:RELATES_TO]-(related:Memory)
         OPTIONAL MATCH (related)-[:TAGGED_WITH]->(t:Tag)
         RETURN related AS m, collect(DISTINCT t.name) AS tags, r.reason AS reason`,
        { memoryId, userId },
      );
      return result.records.map((record) => ({
        memory: toMemoryWithTags(record.toObject()),
        reason: String(record.get("reason") ?? ""),
      }));
    } finally {
      await session.close();
    }
  }

  async getAllRelationships(
    userId: string,
    limit = 500,
  ): Promise<{ source: string; target: string; reason: string }[]> {
    const session = this.driver.session();
    try {
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
    } finally {
      await session.close();
    }
  }

  async getGraphData(userId: string): Promise<{
    nodes: {
      id: string;
      title: string;
      content: string;
      tags: string[];
      createdAt: string;
    }[];
    edges: { source: string; target: string; reason: string }[];
  }> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         WITH m, collect(t.name) AS tags
         WITH collect({ id: m.id, title: m.title, content: left(m.content, 200), tags: tags, createdAt: m.createdAt }) AS nodes,
              collect(m) AS mems
         UNWIND mems AS a
         OPTIONAL MATCH (a)-[r:RELATES_TO]->(b:Memory {userId: $userId})
         WITH nodes, collect(CASE WHEN b IS NOT NULL THEN { source: a.id, target: b.id, reason: r.reason } END) AS rawEdges
         RETURN nodes, [e IN rawEdges WHERE e IS NOT NULL] AS edges`,
        { userId },
      );

      if (result.records.length === 0) {
        return { nodes: [], edges: [] };
      }

      const record = result.records[0];
      const rawNodes = record.get("nodes") as {
        id: string;
        title: string;
        content: string;
        tags: string[];
        createdAt: string;
      }[];
      const rawEdges = record.get("edges") as {
        source: string;
        target: string;
        reason: string;
      }[];

      const nodes = rawNodes.map((n) => ({
        id: String(n.id),
        title: String(n.title),
        content: String(n.content ?? ""),
        tags: (n.tags ?? []).map(String),
        createdAt: String(n.createdAt),
      }));

      const edges = rawEdges
        .filter((e) => e.source && e.target)
        .map((e) => ({
          source: String(e.source),
          target: String(e.target),
          reason: String(e.reason ?? ""),
        }));

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  async getRecentMemoryTitles(
    userId: string,
    excludeId: string,
    limit = 30,
  ): Promise<Array<{ id: string; title: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (m:Memory {userId: $userId})
         WHERE m.id <> $excludeId AND m.status IN ['active', 'pinned']
         RETURN m.id AS id, m.title AS title
         ORDER BY m.updatedAt DESC
         LIMIT $limit`,
        { userId, excludeId, limit: Number(limit) },
      );
      return result.records.map((r) => ({
        id: String(r.get("id")),
        title: String(r.get("title")),
      }));
    } finally {
      await session.close();
    }
  }

  async applyEnrichment(
    memoryId: string,
    userId: string,
    tags: string[],
    relatedIds: string[],
  ): Promise<void> {
    const session = this.driver.session();
    const tx = session.beginTransaction();
    try {
      await tx.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         OPTIONAL MATCH (m)-[r:TAGGED_WITH]->(:Tag)
         DELETE r`,
        { memoryId, userId },
      );

      if (tags.length > 0) {
        await tx.run(
          `MATCH (m:Memory {id: $memoryId, userId: $userId})
           FOREACH (tagName IN $tags |
             MERGE (t:Tag {name: tagName})
             MERGE (m)-[:TAGGED_WITH]->(t)
           )`,
          { memoryId, userId, tags },
        );
      }

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
    } finally {
      await session.close();
    }
  }

  private async logEvent(
    session: ReturnType<Driver["session"]>,
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
