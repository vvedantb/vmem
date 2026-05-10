/**
 * Hybrid retrieval: BM25 fulltext + whole-memory vector + chunk vector +
 * graph expansion + RRF fusion. The orchestrator (`retrieveMemories`)
 * runs the three "leg" queries, merges by memory id, walks the
 * RELATES_TO/MENTIONS graph from the top seeds, then scores and ranks.
 *
 * Each helper owns one leg or one phase so the orchestrator stays a flat
 * ~50-line pipeline. `MergedEntry` is local — never observed externally.
 *
 * Score weights (tuned, frozen for now): RRF 0.45 / graph 0.10 /
 * recency 0.225 / confidence 0.225. Chunk RRF is down-weighted 0.85x
 * vs whole-memory matches so a chunk-only hit cannot beat a strong
 * whole-memory match.
 */

import neo4j, { type Driver, type Session } from "neo4j-driver";
import {
  recencyFromAgeDays,
  rrfScore,
  toMemoryWithTags,
  toNeoInt,
} from "./mappers";
import { profileFilter, withSession } from "./shared";
import {
  type MatchedChunk,
  type MemoryCandidate,
  type MemoryType,
  type MemoryWithTags,
} from "./types";

const TOP_N_SEEDS = 5;
const CHUNK_RRF_WEIGHT = 0.85;

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

interface RetrieveParams {
  userId: string;
  profileId?: string | null;
  query: string;
  /** Pre-computed query embedding. Null ⇒ skip vector legs. */
  queryEmbedding: number[] | null;
  type?: MemoryType;
  tags?: string[];
  limit: number;
}

function computeRrf(entry: MergedEntry): number {
  return (
    (entry.ftRank === null ? 0 : rrfScore(entry.ftRank)) +
    (entry.vecRank === null ? 0 : rrfScore(entry.vecRank)) +
    (entry.chunkRank === null
      ? 0
      : rrfScore(entry.chunkRank) * CHUNK_RRF_WEIGHT)
  );
}

async function runFulltextLeg(
  session: Session,
  params: RetrieveParams,
  legLimit: number,
) {
  const pf = profileFilter(params.profileId, "m");
  return session.run(
    `CALL db.index.fulltext.queryNodes('memory_content', $query)
     YIELD node AS m, score AS fulltextScore
     WHERE m.userId = $userId ${pf.clause}
     OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
     WITH m, collect(t.name) AS tags, fulltextScore,
          duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
     RETURN m, tags, fulltextScore, ageInDays
     ORDER BY fulltextScore DESC
     LIMIT $legLimit`,
    {
      query: params.query,
      userId: params.userId,
      ...pf.params,
      legLimit: neo4j.int(legLimit),
    },
  );
}

async function runVectorLeg(
  session: Session,
  params: RetrieveParams,
  legLimit: number,
) {
  if (!params.queryEmbedding) return null;
  const pf = profileFilter(params.profileId, "m");
  return session.run(
    `CALL db.index.vector.queryNodes('memory_embedding', $k, $queryVector)
     YIELD node AS m, score AS vectorScore
     WHERE m.userId = $userId ${pf.clause}
     OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
     WITH m, collect(t.name) AS tags, vectorScore,
          duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
     RETURN m, tags, vectorScore, ageInDays
     ORDER BY vectorScore DESC`,
    {
      k: neo4j.int(legLimit),
      queryVector: params.queryEmbedding,
      userId: params.userId,
      ...pf.params,
    },
  );
}

async function runChunkLeg(
  session: Session,
  params: RetrieveParams,
  legLimit: number,
) {
  if (!params.queryEmbedding) return null;
  const pf = profileFilter(params.profileId, "m");
  return session.run(
    `CALL db.index.vector.queryNodes('chunk_embedding', $k, $queryVector)
     YIELD node AS c, score AS chunkScore
     WHERE c.userId = $userId
     MATCH (m:Memory {id: c.memoryId})
     WHERE m.userId = $userId ${pf.clause}
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
      ...pf.params,
    },
  );
}

/**
 * Discover memories 1-2 hops from the top initial BM25/vector/chunk
 * matches via RELATES_TO and MENTIONS edges. Three-arm UNION:
 * - 1-hop direct RELATES_TO neighbour
 * - 1-hop via entity hub (memory→entity←memory)
 * - 2-hop memory→memory→memory
 */
export async function expandViaGraph(
  driver: Driver,
  seedIds: string[],
  userId: string,
  limit: number = 50,
): Promise<Array<{ id: string; hops: number }>> {
  if (seedIds.length === 0) return [];
  return withSession(driver, async (session) => {
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
 * Batch-fetch memory metadata for graph-discovered IDs that weren't in
 * the initial BM25/vector results. Returns enough data to build a
 * MergedEntry for each.
 */
export async function fetchMemoryMetadata(
  driver: Driver,
  ids: string[],
  userId: string,
): Promise<Map<string, { memory: MemoryWithTags; ageInDays: number }>> {
  if (ids.length === 0) return new Map();
  return withSession(driver, async (session) => {
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

function buildReasons(
  entry: MergedEntry,
  queryEmbedding: number[] | null,
): string[] {
  const reasons: string[] = [];
  // "Both" is strictly stronger than either single-signal reason; emit
  // it alone when it applies.
  if (entry.fulltextScore > 0.5 && entry.vectorScore > 0.5) {
    reasons.push("matched both keywords and meaning");
  } else if (entry.vectorScore > 0.7) {
    reasons.push("strong semantic match");
  } else if (entry.fulltextScore > 0.5) {
    reasons.push("strong content match");
  }
  // Chunk-level match: a specific paragraph in a long memory matched even
  // if the whole-memory embedding/fulltext didn't rank it highly. Surface
  // this as a distinct reason.
  if (entry.chunkScore > 0 && entry.vecRank === null && entry.ftRank === null) {
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
  if (entry.confidenceScore > 0.8) reasons.push("high confidence source");
  if (entry.memory.status === "pinned") reasons.push("pinned by user");
  if (queryEmbedding === null) {
    reasons.push("semantic search unavailable — set OPENROUTER_API_KEY");
  }
  return reasons;
}

function scoreEntry(
  entry: MergedEntry,
  queryEmbedding: number[] | null,
): MemoryCandidate {
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

  const reasons = buildReasons(entry, queryEmbedding);

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
}

export async function retrieveMemories(
  driver: Driver,
  params: RetrieveParams,
): Promise<MemoryCandidate[]> {
  return withSession(driver, async (session) => {
    const legLimit = params.limit * 2;

    // Three legs run sequentially on the same session — driver doesn't
    // allow concurrent .run() per session, and merging on the same memory
    // id means we want them all in scope before graph expansion.
    const ftResult = await runFulltextLeg(session, params, legLimit);
    const vecResult = await runVectorLeg(session, params, legLimit);
    const chunkResult = await runChunkLeg(session, params, legLimit);

    const merged = new Map<string, MergedEntry>();

    if (ftResult) {
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
    }

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
      // Group by parent memory id, keep the highest-scoring chunk per
      // memory — one matchedChunk surfaces per result even if multiple
      // chunks of the same memory matched.
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
          // Defensive: dedupe via seenMemoryIds means this won't trigger,
          // but ?? guards against future shape changes.
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

    // Graph expansion seeded from the top-N initial matches by combined
    // RRF score.
    const topSeeds = Array.from(merged.entries())
      .sort((a, b) => computeRrf(b[1]) - computeRrf(a[1]))
      .slice(0, TOP_N_SEEDS)
      .map(([id]) => id);

    const graphNeighbors =
      topSeeds.length > 0
        ? await expandViaGraph(driver, topSeeds, params.userId, params.limit)
        : [];

    for (const gn of graphNeighbors) {
      const existing = merged.get(gn.id);
      if (existing) existing.graphHops = gn.hops;
    }

    // Backfill metadata for graph-only discoveries (not in BM25/vector).
    const graphOnlyIds = graphNeighbors
      .filter((gn) => !merged.has(gn.id))
      .map((gn) => gn.id);

    if (graphOnlyIds.length > 0) {
      const metadata = await fetchMemoryMetadata(
        driver,
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

    const candidates = Array.from(merged.values()).map((entry) =>
      scoreEntry(entry, params.queryEmbedding),
    );
    candidates.sort((a, b) => b.trace.score - a.trace.score);
    return candidates.slice(0, params.limit);
  });
}
