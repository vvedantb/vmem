import crypto from "node:crypto";
import neo4j, { type Driver } from "neo4j-driver";
import { z } from "zod";
import type { ConfidenceAdjustment, MergeClusterMember } from "../dreamPrompt";
import type { PortraitEvidenceMemory } from "../portraitPrompt";
import { neo4jGet, parseNeo4jNodeProps } from "../record";
import { toSnapshot } from "./mappers";
import { logEvent, visibleStatusClause, withSession } from "./shared";

const dreamMemoryPropsSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
});

function tryParseMemoryNode(
  value: unknown,
): z.infer<typeof dreamMemoryPropsSchema> | null {
  try {
    return parseNeo4jNodeProps(value, dreamMemoryPropsSchema);
  } catch {
    return null;
  }
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const numbers = value.filter(
    (x: unknown): x is number => typeof x === "number",
  );
  return numbers.length > 0 ? numbers : null;
}

export async function findRecentMemoriesForDream(
  driver: Driver,
  params: {
    userId: string;
    profileId: string;
    sinceMs: number;
    limit: number;
  },
): Promise<
  Array<{
    id: string;
    title: string;
    content: string;
    embedding: number[];
    createdAt: string;
  }>
> {
  return withSession(driver, async (session) => {
    const sinceIso = new Date(params.sinceMs).toISOString();
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, profileId: $profileId})
       WHERE m.embedding IS NOT NULL
         AND m.createdAt >= $sinceIso
         AND ${visibleStatusClause("m", false)}
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
      const embedding = asNumberArray(r.get("embedding"));
      if (embedding === null) return [];
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

function surprisalFromNeighborScores(rawScores: unknown): number | null {
  const scores = asNumberArray(rawScores);
  if (scores === null || scores.length < 2) return null;
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return 1 - mean;
}

export async function computeSurprisalScores(
  driver: Driver,
  params: {
    userId: string;
    memories: Array<{ id: string; embedding: number[] | null | undefined }>;
    k: number;
  },
): Promise<Array<{ id: string; surprisal: number; embedding: number[] }>> {
  return withSession(driver, async (session) => {
    const scored: Array<{
      id: string;
      surprisal: number;
      embedding: number[];
    }> = [];
    for (const memory of params.memories) {
      const embedding = memory.embedding;
      if (embedding == null || embedding.length === 0) continue;

      const result = await session.run(
        `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
         YIELD node, score
         WHERE node.userId = $userId
           AND node.id <> $memoryId
           AND ${visibleStatusClause("node", false)}
         WITH score
         ORDER BY score DESC
         LIMIT $kInner
         RETURN collect(score) AS scores`,
        {
          k: neo4j.int(params.k + 5),
          kInner: neo4j.int(params.k),
          embedding,
          userId: params.userId,
          memoryId: memory.id,
        },
      );
      const firstRecord = result.records[0];
      if (!firstRecord) continue;
      const surprisal = surprisalFromNeighborScores(firstRecord.get("scores"));
      if (surprisal !== null) {
        scored.push({ id: memory.id, surprisal, embedding });
      }
    }
    return scored;
  });
}

const MIN_GRAPH_CLUSTER = 4;
const SEMANTIC_NEIGHBOR_COUNT = 3;
const SEMANTIC_MIN_SCORE = 0.55;

export async function fetchAnomalyCluster(
  driver: Driver,
  params: {
    userId: string;
    anomalyId: string;
    embedding: number[];
    maxClusterSize: number;
  },
): Promise<
  Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    relation: "anomaly" | "related" | "shared-entity" | "semantic";
  }>
> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (a:Memory {id: $anomalyId, userId: $userId})
       OPTIONAL MATCH (a)-[:RELATES_TO]-(rel:Memory {userId: $userId})
         WHERE rel.id <> a.id AND ${visibleStatusClause("rel", false)}
       WITH a, collect(DISTINCT rel) AS relMems
       OPTIONAL MATCH (a)-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(em:Memory {userId: $userId})
         WHERE em.id <> a.id AND ${visibleStatusClause("em", false)}
       WITH a, relMems, collect(DISTINCT em) AS entityMems
       OPTIONAL MATCH (a)-[:TAGGED_WITH]->(at:Tag)
       WITH a, relMems, entityMems, collect(DISTINCT at.name) AS aTags
       RETURN a, aTags, relMems, entityMems`,
      { userId: params.userId, anomalyId: params.anomalyId },
    );
    const firstRecord = result.records[0];
    if (!firstRecord) return [];

    const aProps = parseNeo4jNodeProps(
      neo4jGet(firstRecord, "a"),
      dreamMemoryPropsSchema,
    );
    const aTagsRaw = neo4jGet(firstRecord, "aTags");
    const aTags: string[] = Array.isArray(aTagsRaw)
      ? aTagsRaw.filter((x): x is string => typeof x === "string")
      : [];

    const cluster: Array<{
      id: string;
      title: string;
      content: string;
      tags: string[];
      relation: "anomaly" | "related" | "shared-entity" | "semantic";
    }> = [
      {
        id: aProps.id,
        title: aProps.title,
        content: aProps.content,
        tags: aTags,
        relation: "anomaly",
      },
    ];

    const seen = new Set<string>([aProps.id]);
    const append = (
      nodes: unknown,
      relation: "related" | "shared-entity",
    ): void => {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (cluster.length >= params.maxClusterSize) return;
        const props = tryParseMemoryNode(n);
        if (props === null) continue;
        if (seen.has(props.id)) continue;
        seen.add(props.id);
        cluster.push({
          id: props.id,
          title: props.title,
          content: props.content,
          tags: [],
          relation,
        });
      }
    };

    append(neo4jGet(firstRecord, "relMems"), "related");
    append(neo4jGet(firstRecord, "entityMems"), "shared-entity");

    if (
      cluster.length < MIN_GRAPH_CLUSTER &&
      cluster.length < params.maxClusterSize
    ) {
      const excludeIds = [...seen];
      const semantic = await session.run(
        `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
         YIELD node, score
         WHERE node.userId = $userId
           AND NOT node.id IN $excludeIds
           AND ${visibleStatusClause("node", false)}
           AND score >= $minScore
         RETURN node.id AS id, node.title AS title, node.content AS content
         ORDER BY score DESC
         LIMIT $kInner`,
        {
          k: neo4j.int(SEMANTIC_NEIGHBOR_COUNT + excludeIds.length + 2),
          kInner: neo4j.int(SEMANTIC_NEIGHBOR_COUNT),
          embedding: params.embedding,
          userId: params.userId,
          excludeIds,
          minScore: SEMANTIC_MIN_SCORE,
        },
      );
      for (const record of semantic.records) {
        if (cluster.length >= params.maxClusterSize) break;
        const id = String(neo4jGet(record, "id"));
        if (seen.has(id)) continue;
        seen.add(id);
        cluster.push({
          id,
          title: String(neo4jGet(record, "title")),
          content: String(neo4jGet(record, "content")),
          tags: [],
          relation: "semantic",
        });
      }
    }

    return cluster;
  });
}

export async function materializeSynthesisAsMemory(
  driver: Driver,
  params: {
    userId: string;
    profileId: string;
    title: string;
    content: string;
    embedding: number[] | null;
    contentHash: string;
    sourceMemoryIds: string[];
    confidence: number;
  },
): Promise<{ id: string }> {
  return withSession(driver, async (session) => {
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

    await logEvent(
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

export async function fetchPortraitEvidence(
  driver: Driver,
  params: { userId: string; profileId: string; limit: number },
): Promise<PortraitEvidenceMemory[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, profileId: $profileId})
       WHERE ${visibleStatusClause("m", false)}
       WITH m, duration.inDays(datetime(m.createdAt), datetime()).days AS rawAge
       WITH m, CASE WHEN rawAge < 0 THEN 0 ELSE rawAge END AS ageDays
       WITH m,
            (CASE WHEN m.status = 'pinned' THEN 2.0 ELSE 0.0 END)
            + coalesce(m.confidence, 0.5)
            + 1.0 / (1.0 + toFloat(ageDays) / 30.0) AS score
       ORDER BY score DESC
       LIMIT $limit
       RETURN m.id AS id, m.title AS title, m.content AS content,
              m.type AS type, m.status AS status, m.createdAt AS createdAt`,
      {
        userId: params.userId,
        profileId: params.profileId,
        limit: neo4j.int(params.limit),
      },
    );
    return result.records.map((r) => ({
      id: String(r.get("id")),
      title: String(r.get("title")),
      content: String(r.get("content")),
      type: String(r.get("type")),
      status: String(r.get("status")),
      createdAt: String(r.get("createdAt")),
    }));
  });
}

export async function findMergeCandidates(
  driver: Driver,
  params: {
    userId: string;
    profileId: string;
    pool: Array<{
      id: string;
      title: string;
      content: string;
      embedding: number[];
    }>;
    simThreshold: number;
    maxClusters: number;
    maxClusterSize: number;
  },
): Promise<MergeClusterMember[][]> {
  return withSession(driver, async (session) => {
    const members = new Map<string, MergeClusterMember>();
    const parent = new Map<string, string>();

    const find = (id: string): string => {
      let root = id;
      while ((parent.get(root) ?? root) !== root) {
        root = parent.get(root) ?? root;
      }
      // path compression
      let cur = id;
      while (cur !== root) {
        const next = parent.get(cur) ?? root;
        parent.set(cur, root);
        cur = next;
      }
      return root;
    };
    const union = (a: string, b: string): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };

    for (const seed of params.pool) {
      const result = await session.run(
        `MATCH (seed:Memory {id: $seedId, userId: $userId})
         WHERE seed.status = 'active'
         CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
         YIELD node, score
         WHERE node.userId = $userId
           AND node.profileId = $profileId
           AND node.id <> $seedId
           AND node.status = 'active'
           AND score >= $threshold
         RETURN node.id AS id, node.title AS title, node.content AS content
         ORDER BY score DESC
         LIMIT $kInner`,
        {
          seedId: seed.id,
          userId: params.userId,
          profileId: params.profileId,
          embedding: seed.embedding,
          threshold: params.simThreshold,
          k: neo4j.int(8),
          kInner: neo4j.int(5),
        },
      );
      if (result.records.length === 0) continue;

      if (!members.has(seed.id)) {
        members.set(seed.id, {
          id: seed.id,
          title: seed.title,
          content: seed.content,
        });
        parent.set(seed.id, seed.id);
      }
      for (const record of result.records) {
        const id = String(record.get("id"));
        if (!members.has(id)) {
          members.set(id, {
            id,
            title: String(record.get("title")),
            content: String(record.get("content")),
          });
          parent.set(id, id);
        }
        union(seed.id, id);
      }
    }

    // components of size >= 2, biggest first
    const components = new Map<string, MergeClusterMember[]>();
    for (const member of members.values()) {
      const root = find(member.id);
      const bucket = components.get(root);
      if (bucket) {
        bucket.push(member);
      } else {
        components.set(root, [member]);
      }
    }
    return [...components.values()]
      .filter((c) => c.length >= 2)
      .sort((a, b) => b.length - a.length)
      .slice(0, params.maxClusters)
      .map((c) => c.slice(0, params.maxClusterSize));
  });
}

export async function applyConfidenceAdjustments(
  driver: Driver,
  params: {
    userId: string;
    adjustments: ConfidenceAdjustment[];
    maxDelta: number;
  },
): Promise<number> {
  if (params.adjustments.length === 0) return 0;
  return withSession(driver, async (session) => {
    let applied = 0;
    const now = new Date().toISOString();
    for (const adj of params.adjustments) {
      const result = await session.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         WHERE m.status = 'active' AND m.confidence IS NOT NULL
         WITH m, m.confidence AS old
         WITH m, old,
              CASE
                WHEN $proposed > old + $maxDelta THEN old + $maxDelta
                WHEN $proposed < old - $maxDelta THEN old - $maxDelta
                ELSE $proposed
              END AS moved
         WITH m, old,
              CASE
                WHEN moved < 0.05 THEN 0.05
                WHEN moved > 1.0 THEN 1.0
                ELSE moved
              END AS final
         WHERE abs(final - old) > 0.001
         SET m.confidence = final, m.updatedAt = $now
         RETURN old AS oldConfidence, final AS newConfidence`,
        {
          memoryId: adj.memoryId,
          userId: params.userId,
          proposed: adj.newConfidence,
          maxDelta: params.maxDelta,
          now,
        },
      );
      const record = result.records[0];
      if (!record) continue;
      applied += 1;
      await logEvent(
        session,
        adj.memoryId,
        "confidence_reweighted",
        "dream-mode",
        {
          old: String(record.get("oldConfidence")),
          new: String(record.get("newConfidence")),
          reason: adj.reason,
        },
        null,
      );
    }
    return applied;
  });
}
