import crypto from "node:crypto";
import { groupBy } from "es-toolkit/array";
import { mean } from "es-toolkit/math";
import neo4j, { type Driver } from "neo4j-driver";
import { z } from "zod";
import type {
  ConfidenceAdjustment,
  DreamClusterMember,
  MergeClusterMember,
} from "../dreamPrompt";
import type { PortraitEvidenceMemory } from "../portraitPrompt";
import { neo4jGet, parseNeo4jNodeProps } from "../record";
import { toSnapshot } from "./mappers";
import { withSession } from "../session";
import type { DreamScope, ScopeKind } from "./scope";
import {
  createDerivedMemoryCypher,
  logEvent,
  visibleStatusClause,
} from "./shared";

// team dream reads every member's memories, so reads key on profileId alone
// dreamScope userId is for writes only, personal cypher must stay byte-identical
function ownerMatchProps(scope: DreamScope, includeProfileId = false): string {
  if (scope.kind === "team") return "profileId: $profileId";
  return includeProfileId
    ? "userId: $userId, profileId: $profileId"
    : "userId: $userId";
}

function ownerWhereClause(
  scope: DreamScope,
  alias: string,
  includeProfileId = false,
): string {
  if (scope.kind === "team") return `${alias}.profileId = $profileId`;
  return includeProfileId
    ? `${alias}.userId = $userId AND ${alias}.profileId = $profileId`
    : `${alias}.userId = $userId`;
}

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
    scope: DreamScope;
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
  const sinceIso = new Date(params.sinceMs).toISOString();
  const result = await driver.executeQuery(
    `MATCH (m:Memory {${ownerMatchProps(params.scope, true)}})
       WHERE m.embedding IS NOT NULL
         AND m.createdAt >= $sinceIso
         AND ${visibleStatusClause("m", false)}
       RETURN m.id AS id, m.title AS title, m.content AS content,
              m.embedding AS embedding, m.createdAt AS createdAt
       ORDER BY m.createdAt DESC
       LIMIT $limit`,
    {
      userId: params.scope.userId,
      profileId: params.scope.profileId,
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
}

function surprisalFromNeighborScores(rawScores: unknown): number | null {
  const scores = asNumberArray(rawScores);
  if (scores === null || scores.length < 2) return null;
  return 1 - mean(scores);
}

// AI-generated (Claude), prompt: "compute embedding surprisal score anomaly clusters and high similarity merge candidates in neo4j"
// Modified by me: tuned neighbor k cluster size and merge similarity thresholds
export async function computeSurprisalScores(
  driver: Driver,
  params: {
    scope: DreamScope;
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
         WHERE ${ownerWhereClause(params.scope, "node")}
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
          userId: params.scope.userId,
          profileId: params.scope.profileId,
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
    scope: DreamScope;
    anomalyId: string;
    embedding: number[];
    maxClusterSize: number;
  },
): Promise<DreamClusterMember[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (a:Memory {id: $anomalyId, ${ownerMatchProps(params.scope)}})
       OPTIONAL MATCH (a)-[:RELATES_TO]-(rel:Memory {${ownerMatchProps(params.scope)}})
         WHERE rel.id <> a.id AND ${visibleStatusClause("rel", false)}
       WITH a, collect(DISTINCT rel) AS relMems
       OPTIONAL MATCH (a)-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(em:Memory {${ownerMatchProps(params.scope)}})
         WHERE em.id <> a.id AND ${visibleStatusClause("em", false)}
       WITH a, relMems, collect(DISTINCT em) AS entityMems
       OPTIONAL MATCH (a)-[:TAGGED_WITH]->(at:Tag)
       WITH a, relMems, entityMems, collect(DISTINCT at.name) AS aTags
       RETURN a, aTags, relMems, entityMems`,
      {
        userId: params.scope.userId,
        profileId: params.scope.profileId,
        anomalyId: params.anomalyId,
      },
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

    const cluster: DreamClusterMember[] = [
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
         WHERE ${ownerWhereClause(params.scope, "node")}
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
          userId: params.scope.userId,
          profileId: params.scope.profileId,
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
    // personal DERIVED_FROM keys on userId, team on profileId so all members' sources link
    graphScope: ScopeKind;
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

    await session.run(createDerivedMemoryCypher(params.graphScope), {
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
    });

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
  params: { scope: DreamScope; limit: number },
): Promise<PortraitEvidenceMemory[]> {
  const result = await driver.executeQuery(
    `MATCH (m:Memory {${ownerMatchProps(params.scope, true)}})
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
      userId: params.scope.userId,
      profileId: params.scope.profileId,
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
}

export async function findMergeCandidates(
  driver: Driver,
  params: {
    scope: DreamScope;
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
        `MATCH (seed:Memory {id: $seedId, ${ownerMatchProps(params.scope)}})
         WHERE seed.status = 'active'
         CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
         YIELD node, score
         WHERE ${ownerWhereClause(params.scope, "node", true)}
           AND node.id <> $seedId
           AND node.status = 'active'
           AND score >= $threshold
         RETURN node.id AS id, node.title AS title, node.content AS content
         ORDER BY score DESC
         LIMIT $kInner`,
        {
          seedId: seed.id,
          userId: params.scope.userId,
          profileId: params.scope.profileId,
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

    const components = groupBy([...members.values()], (member) =>
      find(member.id),
    );
    return Object.values(components)
      .filter((c) => c.length >= 2)
      .sort((a, b) => b.length - a.length)
      .slice(0, params.maxClusters)
      .map((c) => c.slice(0, params.maxClusterSize));
  });
}

export async function applyConfidenceAdjustments(
  driver: Driver,
  params: {
    scope: DreamScope;
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
        `MATCH (m:Memory {id: $memoryId, ${ownerMatchProps(params.scope)}})
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
          userId: params.scope.userId,
          profileId: params.scope.profileId,
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
