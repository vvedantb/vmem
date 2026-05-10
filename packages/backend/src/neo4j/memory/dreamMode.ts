/**
 * Dream Mode synthesis primitives.
 *
 * Pulls a candidate pool of recent embedded memories, scores them by
 * surprisal (mean cosine distance to k-nearest neighbours), clusters each
 * anomaly with its 1-hop graph neighbourhood, and (when auto-accept is on)
 * materialises the LLM's synthesis as a new :Memory with :DERIVED_FROM
 * edges. The other path — surfacing a synthesis :ProposedUpdate through
 * the /proposals queue — lives in `proposals.ts`.
 *
 * `unknown` casts here mirror the original implementation. They live at
 * the Neo4j boundary where record values arrive untyped. Refactor target,
 * not refactor scope.
 */

import crypto from "node:crypto";
import neo4j, { type Driver } from "neo4j-driver";
import { toSnapshot } from "./mappers";
import { logEvent, withSession } from "./shared";

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
 * Compute surprisal score for one memory against the user's full corpus.
 * surprisal = 1 - mean(cosineSimilarity to k nearest neighbours). Higher
 * = more anomalous = more interesting for the Dreamer to expand on.
 *
 * Asks the index for k+5 because it returns the memory itself as its own
 * closest match (sim 1.0); we filter by id and average the rest. Returns
 * null when fewer than 2 neighbours are available — not enough signal.
 */
export async function computeSurprisalScore(
  driver: Driver,
  params: {
    userId: string;
    memoryId: string;
    embedding: number[];
    k: number;
  },
): Promise<number | null> {
  return withSession(driver, async (session) => {
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
 * For an anomaly memory, fetch its 1-hop graph neighbourhood:
 *   - Memories linked via RELATES_TO (either direction)
 *   - Memories that MENTIONS the same entity
 * Caps at `maxClusterSize`. The anomaly is always element 0 so the LLM
 * has a clear focal point.
 */
export async function fetchAnomalyCluster(
  driver: Driver,
  params: {
    userId: string;
    anomalyId: string;
    maxClusterSize: number;
  },
): Promise<
  Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    relation: "anomaly" | "related" | "shared-entity";
  }>
> {
  return withSession(driver, async (session) => {
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
 * Auto-accept path: directly create a :Memory of type 'knowledge' with
 * source 'dream-mode' and :DERIVED_FROM edges to each source. Used when
 * the profile has `dreamModeAutoAccept = true`.
 *
 * Mirrors `createMemory` minus the same-session/same-domain edge
 * scaffolding (synthesis memories aren't from a session) and minus the
 * URL/file-upload metadata.
 */
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
