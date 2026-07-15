import neo4j, { type Driver, type Record, type Session } from "neo4j-driver";
import { toMemoryContentFulltextQuery } from "../luceneQuery";
import { neo4jGet, neo4jString, parseNeo4jInt } from "../record";
import { recencyFromAgeDays, rrfScore, toMemoryWithTags } from "./mappers";
import { withSession } from "../session";
import { profileFilter, visibleStatusClause } from "./shared";
import type {
  GraphExpansion,
  MemoryCandidate,
  MemoryType,
  MemoryWithTags,
  MergedEntry,
  ScoreBreakdown,
} from "./types";

const TOP_N_SEEDS = 5;
const VECTOR_RRF_WEIGHT = 1.0;
const FULLTEXT_RRF_WEIGHT = 0.45;
const ENTITY_RRF_WEIGHT = 0.8;
const CHUNK_RRF_WEIGHT = 0.85;
const GRAPH_RRF_WEIGHT = 0.85;
const DEDUP_COSINE_THRESHOLD = 0.92;
const RECENCY_BOOST = 0.5;
const CONFIDENCE_BOOST = 0.3;

interface RetrieveParams {
  userId: string;
  profileId?: string | null;
  query: string;
  // pre-computed query embedding
  queryEmbedding: number[] | null;
  // characterization: type and tags are accepted but not applied to retrieval legs
  type?: MemoryType;
  tags?: string[];
  limit: number;
  queryExpansion?: {
    generateParaphrases(query: string): Promise<string[]>;
    embedTexts(texts: string[]): Promise<(number[] | null)[]>;
  };
  rerankCandidates?: (
    query: string,
    candidates: Array<{ title: string; content: string }>,
  ) => Promise<number[] | null>;
  legs?: {
    fulltext?: boolean;
    vector?: boolean;
    chunk?: boolean;
    entity?: boolean;
    graph?: boolean;
    dedup?: boolean;
  };
}

interface RankedRecord {
  record: Record;
  rank: number;
}

interface ScoredEntry {
  entry: MergedEntry;
  candidate: MemoryCandidate;
}

function featureFlagEnabled(name: string): boolean {
  const value = process.env[name];
  return value === "1" || value === "true";
}

function rrfContribution(rank: number | null, weight: number): number {
  return rank === null ? 0 : rrfScore(rank) * weight;
}

function computeRrf(entry: MergedEntry): number {
  return (
    rrfContribution(entry.ftRank, FULLTEXT_RRF_WEIGHT) +
    rrfContribution(entry.vecRank, VECTOR_RRF_WEIGHT) +
    rrfContribution(entry.chunkRank, CHUNK_RRF_WEIGHT) +
    rrfContribution(entry.graphRank, GRAPH_RRF_WEIGHT) +
    rrfContribution(entry.entityRank, ENTITY_RRF_WEIGHT)
  );
}

function embeddingFromRecord(record: Record): number[] | null {
  const raw = neo4jGet(record, "embedding");
  if (!Array.isArray(raw)) return null;
  if (!raw.every((item): item is number => typeof item === "number")) {
    return null;
  }
  return raw;
}

function createMergedEntry(
  memory: MemoryWithTags,
  ageInDays: number,
  embedding: number[] | null,
): MergedEntry {
  return {
    memory,
    fulltextScore: 0,
    vectorScore: 0,
    chunkScore: 0,
    entityScore: 0,
    recencyScore: recencyFromAgeDays(ageInDays, memory.type),
    confidenceScore: memory.confidence,
    ftRank: null,
    vecRank: null,
    chunkRank: null,
    entityRank: null,
    graphRank: null,
    graphHops: null,
    seedCount: 0,
    graphSeedId: null,
    graphSeedTitle: null,
    bridgingEntity: null,
    embedding,
    rerankerScore: null,
    matchedChunk: null,
  };
}

async function runFulltextLeg(
  driver: Driver,
  params: RetrieveParams,
  legLimit: number,
) {
  const luceneQuery = toMemoryContentFulltextQuery(params.query);
  if (luceneQuery === null) {
    return { records: [] };
  }

  try {
    return await withSession(driver, async (session) => {
      const pf = profileFilter(params.profileId, "m");
      return session.run(
        `CALL db.index.fulltext.queryNodes('memory_content', $query)
       YIELD node AS m, score AS fulltextScore
       WHERE m.userId = $userId ${pf.clause} AND ${visibleStatusClause("m")}
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       WITH m, collect(t.name) AS tags, fulltextScore,
            duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
       RETURN m, tags, fulltextScore, ageInDays, m.embedding AS embedding
       ORDER BY fulltextScore DESC
       LIMIT $legLimit`,
        {
          query: luceneQuery,
          userId: params.userId,
          ...pf.params,
          legLimit: neo4j.int(legLimit),
        },
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[retrieve] fulltext leg skipped: ${message}`);
    return { records: [] };
  }
}

async function runVectorQuery(
  session: Session,
  params: RetrieveParams,
  legLimit: number,
  queryEmbedding: number[],
) {
  const pf = profileFilter(params.profileId, "m");
  return session.run(
    `CALL db.index.vector.queryNodes('memory_embedding', $k, $queryVector)
     YIELD node AS m, score AS vectorScore
     WHERE m.userId = $userId ${pf.clause} AND ${visibleStatusClause("m")}
     OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
     WITH m, collect(t.name) AS tags, vectorScore,
          duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
     RETURN m, tags, vectorScore, ageInDays, m.embedding AS embedding
     ORDER BY vectorScore DESC`,
    {
      k: neo4j.int(legLimit),
      queryVector: queryEmbedding,
      userId: params.userId,
      ...pf.params,
    },
  );
}

async function runVectorLeg(
  driver: Driver,
  params: RetrieveParams,
  legLimit: number,
  queryEmbeddings: number[][],
): Promise<RankedRecord[]> {
  if (queryEmbeddings.length === 0) return [];

  const results = await Promise.all(
    queryEmbeddings.map((queryEmbedding) =>
      withSession(driver, (session) =>
        runVectorQuery(session, params, legLimit, queryEmbedding),
      ),
    ),
  );
  return mergeExpandedRankings(results, "vectorScore", legLimit);
}

async function runChunkQuery(
  session: Session,
  params: RetrieveParams,
  legLimit: number,
  queryEmbedding: number[],
) {
  const pf = profileFilter(params.profileId, "m");
  try {
    return await session.run(
      `CALL db.index.vector.queryNodes('chunk_embedding', $k, $queryVector)
       YIELD node AS c, score AS chunkScore
       WHERE c.userId = $userId
       MATCH (m:Memory {id: c.memoryId})
       WHERE m.userId = $userId ${pf.clause} AND ${visibleStatusClause("m")}
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       WITH m, collect(DISTINCT t.name) AS tags, chunkScore, c.content AS chunkContent,
            c.position AS chunkPosition,
            duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
       RETURN m, tags, chunkScore, chunkContent, chunkPosition, ageInDays,
              m.embedding AS embedding
       ORDER BY chunkScore DESC`,
      {
        k: neo4j.int(legLimit),
        queryVector: queryEmbedding,
        userId: params.userId,
        ...pf.params,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("chunk_embedding") ||
      message.includes("no such vector schema index")
    ) {
      console.warn(
        "[retrieve] chunk_embedding index missing - skipping chunk leg. Run ensureNeo4jSetup to create it.",
        message,
      );
      return null;
    }
    throw err;
  }
}

async function runChunkLeg(
  driver: Driver,
  params: RetrieveParams,
  legLimit: number,
  queryEmbeddings: number[][],
): Promise<RankedRecord[]> {
  if (queryEmbeddings.length === 0) return [];

  const results = await Promise.all(
    queryEmbeddings.map((queryEmbedding) =>
      withSession(driver, (session) =>
        runChunkQuery(session, params, legLimit, queryEmbedding),
      ),
    ),
  );
  const successfulResults = results.flatMap((result) =>
    result === null ? [] : [result],
  );
  return mergeExpandedRankings(successfulResults, "chunkScore", legLimit);
}

function mergeExpandedRankings(
  results: Array<{ records: Record[] }>,
  scoreKey: string,
  legLimit: number,
): RankedRecord[] {
  const byMemory = new Map<
    string,
    { record: Record; score: number; fusedScore: number }
  >();

  for (const result of results) {
    result.records.forEach((record, index) => {
      const memory = toMemoryWithTags(record);
      const score = Number(neo4jGet(record, scoreKey));
      const existing = byMemory.get(memory.id);
      const fusedScore = (existing?.fusedScore ?? 0) + rrfScore(index + 1);
      if (!existing || score > existing.score) {
        byMemory.set(memory.id, { record, score, fusedScore });
      } else {
        existing.fusedScore = fusedScore;
      }
    });
  }

  return Array.from(byMemory.values())
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, legLimit)
    .map((item, index) => ({ record: item.record, rank: index + 1 }));
}

function queryEntityCandidates(query: string): string[] {
  const tokens = query
    .match(/[a-zA-Z0-9][a-zA-Z0-9+.#-]*/g)
    ?.map((token) => token.toLowerCase());
  if (!tokens) return [];

  const candidates = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    if (current === undefined || current.length < 2) continue;
    candidates.add(current);
    const next = tokens[i + 1];
    if (next !== undefined) candidates.add(`${current} ${next}`);
  }
  return Array.from(candidates);
}

async function runEntityLeg(
  driver: Driver,
  params: RetrieveParams,
  legLimit: number,
): Promise<RankedRecord[]> {
  const queryEntities = queryEntityCandidates(params.query);
  if (queryEntities.length === 0) return [];

  return withSession(driver, async (session) => {
    const pf = profileFilter(params.profileId, "m");
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})-[:MENTIONS]->(e:Entity)
       WHERE (toLower(coalesce(e.name, e.normalizedName)) IN $queryEntities
          OR toLower(e.normalizedName) IN $queryEntities)
         ${pf.clause} AND ${visibleStatusClause("m")}
       WITH m,
            count(DISTINCT e) AS overlap,
            sum(CASE
              WHEN e.memoryCount IS NULL THEN 1.0
              ELSE 1.0 / (1.0 + log(1 + e.memoryCount))
            END) AS rarityScore
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       WITH m, collect(DISTINCT t.name) AS tags, overlap, rarityScore,
            duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
       RETURN m, tags, overlap, rarityScore, ageInDays, m.embedding AS embedding
       ORDER BY rarityScore DESC, overlap DESC
       LIMIT $legLimit`,
      {
        userId: params.userId,
        queryEntities,
        ...pf.params,
        legLimit: neo4j.int(legLimit),
      },
    );

    return result.records.map((record, index) => ({
      record,
      rank: index + 1,
    }));
  });
}

async function expandViaGraph(
  driver: Driver,
  seedIds: string[],
  userId: string,
  limit: number = 50,
): Promise<GraphExpansion[]> {
  if (seedIds.length === 0) return [];
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (seed:Memory {userId: $userId})-[:RELATES_TO]-(neighbor:Memory {userId: $userId})
       WHERE seed.id IN $seedIds AND NOT neighbor.id IN $seedIds
         AND ${visibleStatusClause("neighbor")}
       RETURN neighbor.id AS id, 1 AS hops, seed.id AS seedId, null AS bridgingEntity
       UNION ALL
       MATCH (seed:Memory {userId: $userId})-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(neighbor:Memory {userId: $userId})
       WHERE seed.id IN $seedIds AND NOT neighbor.id IN $seedIds
         AND ${visibleStatusClause("neighbor")}
       RETURN neighbor.id AS id, 1 AS hops, seed.id AS seedId,
              coalesce(e.name, e.normalizedName) AS bridgingEntity
       UNION ALL
       MATCH (seed:Memory {userId: $userId})-[:RELATES_TO]-(mid:Memory {userId: $userId})-[:RELATES_TO]-(neighbor:Memory {userId: $userId})
       WHERE seed.id IN $seedIds AND NOT neighbor.id IN $seedIds AND NOT mid.id IN $seedIds
         AND ${visibleStatusClause("mid")}
         AND ${visibleStatusClause("neighbor")}
       RETURN neighbor.id AS id, 2 AS hops, seed.id AS seedId, null AS bridgingEntity`,
      { seedIds, userId },
    );

    const byId = new Map<
      string,
      {
        hops: number;
        seedIds: Set<string>;
        seedId: string | null;
        bridgingEntity: string | null;
      }
    >();

    for (const record of result.records) {
      const id = neo4jString(record, "id");
      const hops = parseNeo4jInt(neo4jGet(record, "hops"));
      const seedId = neo4jString(record, "seedId");
      const bridgingRaw = neo4jGet(record, "bridgingEntity");
      const bridgingEntity =
        typeof bridgingRaw === "string" && bridgingRaw.length > 0
          ? bridgingRaw
          : null;
      const existing = byId.get(id);

      if (!existing) {
        byId.set(id, {
          hops,
          seedIds: new Set(seedId ? [seedId] : []),
          seedId: seedId || null,
          bridgingEntity,
        });
        continue;
      }

      if (seedId) existing.seedIds.add(seedId);
      if (hops < existing.hops) {
        existing.hops = hops;
        existing.seedId = seedId || existing.seedId;
        existing.bridgingEntity = bridgingEntity;
      } else if (existing.bridgingEntity === null && bridgingEntity !== null) {
        existing.bridgingEntity = bridgingEntity;
        existing.seedId = seedId || existing.seedId;
      }
    }

    return Array.from(byId.entries())
      .map(([id, value]) => ({
        id,
        hops: value.hops,
        seedCount: value.seedIds.size,
        bridgingEntity: value.bridgingEntity,
        seedId: value.seedId,
      }))
      .sort((a, b) => a.hops - b.hops || b.seedCount - a.seedCount)
      .slice(0, limit);
  });
}

async function fetchMemoryMetadata(
  driver: Driver,
  ids: string[],
  userId: string,
): Promise<
  Map<
    string,
    { memory: MemoryWithTags; ageInDays: number; embedding: number[] | null }
  >
> {
  if (ids.length === 0) return new Map();
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.id IN $ids
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       WITH m, collect(t.name) AS tags,
            duration.between(datetime(m.createdAt), datetime()).days AS ageInDays
       RETURN m, tags, ageInDays, m.embedding AS embedding`,
      { ids, userId },
    );
    const map = new Map<
      string,
      { memory: MemoryWithTags; ageInDays: number; embedding: number[] | null }
    >();
    for (const record of result.records) {
      const memory = toMemoryWithTags(record);
      const ageInDays = parseNeo4jInt(neo4jGet(record, "ageInDays"));
      map.set(memory.id, {
        memory,
        ageInDays,
        embedding: embeddingFromRecord(record),
      });
    }
    return map;
  });
}

function buildReasons(
  entry: MergedEntry,
  queryEmbedding: number[] | null,
): string[] {
  const reasons: string[] = [];
  if (entry.fulltextScore > 0.5 && entry.vectorScore > 0.5) {
    reasons.push("matched both keywords and meaning");
  } else if (entry.vectorScore > 0.7) {
    reasons.push("strong semantic match");
  } else if (entry.fulltextScore > 0.5) {
    reasons.push("strong content match");
  }
  if (entry.chunkScore > 0 && entry.vecRank === null && entry.ftRank === null) {
    reasons.push("matched specific passage in long content");
  } else if (entry.chunkScore > 0) {
    reasons.push("matched specific passage");
  }
  if (entry.entityScore > 0) {
    reasons.push("matched named entities from the query");
  }
  if (entry.graphRank !== null) {
    const seedTitle = entry.graphSeedTitle ?? "a top match";
    if (entry.bridgingEntity !== null) {
      reasons.push(`connected to "${seedTitle}" via "${entry.bridgingEntity}"`);
    } else {
      reasons.push(`connected to "${seedTitle}" in the knowledge graph`);
    }
    if (entry.seedCount >= 2) {
      reasons.push(
        `${String(entry.seedCount)} of your top matches link to this`,
      );
    }
  }
  if (entry.recencyScore > 0.8) reasons.push("recently created");
  if (entry.confidenceScore > 0.8) reasons.push("high confidence source");
  if (entry.memory.status === "pinned") reasons.push("pinned by user");
  if (queryEmbedding === null) {
    reasons.push("semantic search unavailable - set OPENROUTER_API_KEY");
  }
  return reasons;
}

const FULLTEXT_SIGNAL_THRESHOLD = 1.0;
const VECTOR_SIGNAL_THRESHOLD = 0.72;
const CHUNK_SIGNAL_THRESHOLD = 0.5;

function hasStrongDirectMatch(entry: MergedEntry): boolean {
  return (
    (entry.ftRank !== null &&
      entry.fulltextScore > FULLTEXT_SIGNAL_THRESHOLD) ||
    (entry.vecRank !== null && entry.vectorScore > VECTOR_SIGNAL_THRESHOLD) ||
    (entry.chunkRank !== null && entry.chunkScore > CHUNK_SIGNAL_THRESHOLD) ||
    (entry.entityRank !== null && entry.entityScore > 0)
  );
}

function scoreEntry(
  entry: MergedEntry,
  queryEmbedding: number[] | null,
): MemoryCandidate {
  const rrfCombined = computeRrf(entry);
  const boost = hasStrongDirectMatch(entry)
    ? 1 +
      entry.recencyScore * RECENCY_BOOST +
      entry.confidenceScore * CONFIDENCE_BOOST
    : 1;
  const totalScore = rrfCombined * boost;

  const reasons = buildReasons(entry, queryEmbedding);
  const scoreBreakdown: ScoreBreakdown = {
    fulltext: entry.fulltextScore,
    vector: entry.vectorScore,
    chunk: entry.chunkScore,
    entity: entry.entityScore,
    rrf: rrfCombined,
    recency: entry.recencyScore,
    confidence: entry.confidenceScore,
  };
  if (
    entry.graphRank !== null &&
    entry.graphSeedTitle !== null &&
    entry.graphHops !== null
  ) {
    scoreBreakdown.graphPath = {
      seedTitle: entry.graphSeedTitle,
      bridgingEntity: entry.bridgingEntity,
      hops: entry.graphHops,
    };
  }
  if (entry.rerankerScore !== null) {
    scoreBreakdown.rerankerScore = entry.rerankerScore;
  }

  return {
    ...entry.memory,
    trace: {
      score: totalScore,
      scoreBreakdown,
      reason:
        reasons.length > 0
          ? `Matched because: ${reasons.join(", ")}`
          : "Weak match across all signals",
    },
    matchedChunk: entry.matchedChunk ?? undefined,
  };
}

function mergeFulltext(merged: Map<string, MergedEntry>, records: Record[]) {
  records.forEach((record, index) => {
    const memory = toMemoryWithTags(record);
    const ageInDays = parseNeo4jInt(neo4jGet(record, "ageInDays"));
    const entry = createMergedEntry(
      memory,
      ageInDays,
      embeddingFromRecord(record),
    );
    entry.fulltextScore = Number(neo4jGet(record, "fulltextScore"));
    entry.ftRank = index + 1;
    merged.set(memory.id, entry);
  });
}

function getOrCreateEntry(
  merged: Map<string, MergedEntry>,
  record: Record,
): { memory: MemoryWithTags; entry: MergedEntry } {
  const memory = toMemoryWithTags(record);
  const ageInDays = parseNeo4jInt(neo4jGet(record, "ageInDays"));
  const entry =
    merged.get(memory.id) ??
    createMergedEntry(memory, ageInDays, embeddingFromRecord(record));
  return { memory, entry };
}

function mergeVector(merged: Map<string, MergedEntry>, ranked: RankedRecord[]) {
  for (const item of ranked) {
    const { memory, entry } = getOrCreateEntry(merged, item.record);
    entry.vectorScore = Number(neo4jGet(item.record, "vectorScore"));
    entry.vecRank = item.rank;
    merged.set(memory.id, entry);
  }
}

function mergeChunks(merged: Map<string, MergedEntry>, ranked: RankedRecord[]) {
  const seenMemoryIds = new Set<string>();
  for (const item of ranked) {
    const memory = toMemoryWithTags(item.record);
    if (seenMemoryIds.has(memory.id)) continue;
    seenMemoryIds.add(memory.id);

    const ageInDays = parseNeo4jInt(neo4jGet(item.record, "ageInDays"));
    const existing =
      merged.get(memory.id) ??
      createMergedEntry(memory, ageInDays, embeddingFromRecord(item.record));
    existing.chunkScore = Number(neo4jGet(item.record, "chunkScore"));
    existing.chunkRank = item.rank;
    existing.matchedChunk ??= {
      content: neo4jString(item.record, "chunkContent"),
      position: parseNeo4jInt(neo4jGet(item.record, "chunkPosition")),
    };
    merged.set(memory.id, existing);
  }
}

function mergeEntities(
  merged: Map<string, MergedEntry>,
  ranked: RankedRecord[],
) {
  for (const item of ranked) {
    const { memory, entry } = getOrCreateEntry(merged, item.record);
    entry.entityScore = Number(neo4jGet(item.record, "rarityScore"));
    entry.entityRank = item.rank;
    merged.set(memory.id, entry);
  }
}

async function queryEmbeddingsForRetrieval(
  params: RetrieveParams,
): Promise<number[][]> {
  if (params.queryEmbedding === null) return [];
  if (
    !featureFlagEnabled("VMEM_ENABLE_QUERY_EXPANSION") ||
    params.queryExpansion === undefined
  ) {
    return [params.queryEmbedding];
  }

  const paraphrases = await params.queryExpansion.generateParaphrases(
    params.query,
  );
  if (paraphrases.length === 0) return [params.queryEmbedding];

  const expandedEmbeddings =
    await params.queryExpansion.embedTexts(paraphrases);
  const queryEmbeddings = [params.queryEmbedding];
  for (const embedding of expandedEmbeddings) {
    if (embedding !== null) queryEmbeddings.push(embedding);
  }
  return queryEmbeddings;
}

function cosineSimilarity(a: number[] | null, b: number[] | null): number {
  if (a === null || b === null || a.length !== b.length) return 0;
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let i = 0; i < a.length; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    dot += left * right;
    aMagnitude += left * left;
    bMagnitude += right * right;
  }
  if (aMagnitude === 0 || bMagnitude === 0) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

function applyDedup(
  scored: ScoredEntry[],
  queryEmbedding: number[] | null,
): ScoredEntry[] {
  if (queryEmbedding === null) return scored;
  if (!scored.some((item) => item.entry.embedding !== null)) return scored;

  const kept: ScoredEntry[] = [];
  const deferred: ScoredEntry[] = [];
  for (const item of scored) {
    const embedding = item.entry.embedding;
    if (embedding === null) {
      kept.push(item);
      continue;
    }
    const isNearDuplicate = kept.some((chosen) => {
      const other = chosen.entry.embedding;
      return (
        other !== null &&
        cosineSimilarity(embedding, other) >= DEDUP_COSINE_THRESHOLD
      );
    });
    if (isNearDuplicate) deferred.push(item);
    else kept.push(item);
  }
  return [...kept, ...deferred];
}

async function applyReranker(
  query: string,
  scored: ScoredEntry[],
  rerankCandidates:
    | ((
        query: string,
        candidates: Array<{ title: string; content: string }>,
      ) => Promise<number[] | null>)
    | undefined,
): Promise<ScoredEntry[]> {
  if (
    !featureFlagEnabled("VMEM_ENABLE_RERANK") ||
    rerankCandidates === undefined
  ) {
    return scored;
  }

  const top = scored.slice(0, Math.min(30, scored.length));
  const tail = scored.slice(top.length);
  const scores = await rerankCandidates(
    query,
    top.map((item) => ({
      title: item.entry.memory.title,
      content: item.entry.memory.content,
    })),
  );
  if (scores === null) return scored;

  top.forEach((item, index) => {
    const score = scores[index];
    if (score === undefined) return;
    item.entry.rerankerScore = score;
    item.candidate.trace.scoreBreakdown.rerankerScore = score;
  });

  return [
    ...top.sort(
      (a, b) => (b.entry.rerankerScore ?? 0) - (a.entry.rerankerScore ?? 0),
    ),
    ...tail,
  ];
}

export async function retrieveMemories(
  driver: Driver,
  params: RetrieveParams,
): Promise<MemoryCandidate[]> {
  const legLimit = Math.max(params.limit * 4, 20);
  const queryEmbeddings = await queryEmbeddingsForRetrieval(params);

  const useFulltext = params.legs?.fulltext !== false;
  const useVector = params.legs?.vector !== false;
  const useChunk = params.legs?.chunk !== false;
  const useEntity = params.legs?.entity !== false;
  const useGraph = params.legs?.graph !== false;
  const useDedup = params.legs?.dedup !== false;

  const [ftResult, vectorRanked, chunkRanked, entityRanked] = await Promise.all(
    [
      useFulltext
        ? runFulltextLeg(driver, params, legLimit)
        : Promise.resolve({ records: [] }),
      useVector
        ? runVectorLeg(driver, params, legLimit, queryEmbeddings)
        : Promise.resolve([]),
      useChunk
        ? runChunkLeg(driver, params, legLimit, queryEmbeddings)
        : Promise.resolve([]),
      useEntity ? runEntityLeg(driver, params, legLimit) : Promise.resolve([]),
    ],
  );

  const merged = new Map<string, MergedEntry>();
  mergeFulltext(merged, ftResult.records);
  mergeVector(merged, vectorRanked);
  mergeChunks(merged, chunkRanked);
  mergeEntities(merged, entityRanked);

  const topSeeds = Array.from(merged.entries())
    .sort((a, b) => computeRrf(b[1]) - computeRrf(a[1]))
    .slice(0, TOP_N_SEEDS);
  const seedIds = topSeeds.map(([id]) => id);
  const seedTitleById = new Map(
    topSeeds.map(([id, entry]) => [id, entry.memory.title]),
  );

  const graphNeighbors =
    useGraph && seedIds.length > 0
      ? await expandViaGraph(driver, seedIds, params.userId, params.limit * 10)
      : [];

  const graphOnlyIds = graphNeighbors
    .filter((neighbor) => !merged.has(neighbor.id))
    .map((neighbor) => neighbor.id);
  const graphOnlyMetadata = await fetchMemoryMetadata(
    driver,
    graphOnlyIds,
    params.userId,
  );

  graphNeighbors.forEach((neighbor, index) => {
    const existing = merged.get(neighbor.id);
    const metadata = graphOnlyMetadata.get(neighbor.id);
    const entry =
      existing ??
      (metadata
        ? createMergedEntry(
            metadata.memory,
            metadata.ageInDays,
            metadata.embedding,
          )
        : null);
    if (entry === null) return;

    entry.graphRank = index + 1;
    entry.graphHops = neighbor.hops;
    entry.seedCount = neighbor.seedCount;
    entry.graphSeedId = neighbor.seedId;
    entry.graphSeedTitle =
      neighbor.seedId === null
        ? null
        : (seedTitleById.get(neighbor.seedId) ?? null);
    entry.bridgingEntity = neighbor.bridgingEntity;
    merged.set(neighbor.id, entry);
  });

  let scored = Array.from(merged.values())
    .map((entry) => ({
      entry,
      candidate: scoreEntry(entry, params.queryEmbedding),
    }))
    .sort((a, b) => b.candidate.trace.score - a.candidate.trace.score);

  if (useDedup) {
    scored = applyDedup(scored, params.queryEmbedding);
  }
  scored = await applyReranker(params.query, scored, params.rerankCandidates);

  return scored.slice(0, params.limit).map((item) => {
    if (item.entry.rerankerScore !== null) {
      return scoreEntry(item.entry, params.queryEmbedding);
    }
    return item.candidate;
  });
}
