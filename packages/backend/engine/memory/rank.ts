import type { MemoryCandidate, MemoryWithTags } from "@vmem/sdk";
import { expandGraphNeighbors, type MemoryLinkEdge } from "./links";
import { expandQueryTerms, phraseAwareQueryTokens } from "./synonyms";
import { contentTokens, tokenize } from "./tokens";

const BM25_K1 = 1.4;
const BM25_B = 0.6;
const RRF_K = 20;
const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 2;
const RECENCY_HALFLIFE_DAYS = 365;
const MS_PER_DAY = 86_400_000;
const GRAPH_SEED_LIMIT = 5;
const GRAPH_NEIGHBOR_LIMIT = 40;
const GRAPH_SEED_SCORE_FLOOR = 0.4;
const GRAPH_NEIGHBOR_FROM_SEED = 0.9;

export interface RetrievalLegs {
  fulltext?: boolean;
  vector?: boolean;
  chunk?: boolean;
  entity?: boolean;
  graph?: boolean;
  recency?: boolean;
}

export interface RankMemoriesOptions {
  limit?: number;
  nowMs?: number;
  vectorScores?: ReadonlyMap<string, number>;
  ftsRanks?: ReadonlyMap<string, number>;
  legs?: RetrievalLegs;
  links?: readonly MemoryLinkEdge[];
}

function legOn(
  legs: RetrievalLegs | undefined,
  key: keyof RetrievalLegs,
): boolean {
  return legs?.[key] !== false;
}

export interface RelatedMemoryHit {
  memory: MemoryWithTags;
  reason: string;
  score: number;
}

interface DocTokens {
  memory: MemoryWithTags;
  title: string[];
  content: string[];
  tags: string[];
  all: string[];
  length: number;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function haystack(memory: Pick<MemoryWithTags, "title" | "content">): string {
  return `${memory.title}\n${memory.content}`.toLowerCase();
}

function tokenizeDoc(memory: MemoryWithTags): DocTokens {
  const title = contentTokens(memory.title, true);
  const content = contentTokens(memory.content, true);
  const tags = contentTokens(memory.tags.join(" "), false);
  const all = [...title, ...content, ...tags];
  return {
    memory,
    title,
    content,
    tags,
    all,
    length: Math.max(
      1,
      title.length * TITLE_WEIGHT + content.length + tags.length * TAG_WEIGHT,
    ),
  };
}

function termFrequency(
  tokens: readonly string[],
  term: string,
  weight: number,
): number {
  let count = 0;
  for (const token of tokens) {
    if (token === term) count += 1;
  }
  return count * weight;
}

function bm25Score(
  doc: DocTokens,
  queryTerms: readonly string[],
  df: ReadonlyMap<string, number>,
  docCount: number,
  avgLength: number,
): number {
  let score = 0;
  for (const term of queryTerms) {
    const tf =
      termFrequency(doc.title, term, TITLE_WEIGHT) +
      termFrequency(doc.content, term, 1) +
      termFrequency(doc.tags, term, TAG_WEIGHT);
    if (tf === 0) continue;
    const docsWithTerm = df.get(term) ?? 0;
    const idf = Math.log(
      1 + (docCount - docsWithTerm + 0.5) / (docsWithTerm + 0.5),
    );
    const denom =
      tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.length / avgLength));
    score += idf * ((tf * (BM25_K1 + 1)) / denom);
  }
  return score;
}

function phraseScore(memory: MemoryWithTags, query: string): number {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return 0;
  const title = memory.title.toLowerCase();
  const content = memory.content.toLowerCase();
  if (title.includes(needle)) return 1;
  if (content.includes(needle)) return 0.86;
  const queryTokens = phraseAwareQueryTokens(query);
  if (queryTokens.length === 0) return 0;
  const titleSet = new Set(contentTokens(memory.title, true));
  const contentSet = new Set(contentTokens(memory.content, true));
  let titleHits = 0;
  let contentHits = 0;
  for (const token of queryTokens) {
    if (titleSet.has(token)) titleHits += 1;
    if (contentSet.has(token)) contentHits += 1;
  }
  if (titleHits === queryTokens.length) return 1;
  if (contentHits === queryTokens.length) return 0.86;
  const titleFrac = titleHits / queryTokens.length;
  const contentFrac = contentHits / queryTokens.length;
  if (titleFrac >= 0.4) return 0.45 + 0.5 * titleFrac;
  if (contentFrac >= 0.4) return 0.3 + 0.3 * contentFrac;
  if (titleFrac > 0) return 0.2 * titleFrac;
  return 0;
}

function chunkScore(
  memory: MemoryWithTags,
  queryTerms: readonly string[],
): number {
  if (queryTerms.length === 0) return 0;
  const sentences = memory.content.split(/[.!?\n]+/);
  const chunks = [memory.title, ...sentences]
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  let best = 0;
  for (const chunk of chunks) {
    const tokens = new Set(contentTokens(chunk, true));
    if (tokens.size === 0) continue;
    let hits = 0;
    for (const term of queryTerms) {
      if (tokens.has(term)) hits += 1;
    }
    const overlap = hits / queryTerms.length;
    if (overlap > best) best = overlap;
  }
  return best;
}

function properNames(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split(/[^A-Za-z0-9]+/)) {
    if (raw.length < 3) continue;
    const first = raw[0];
    if (first === undefined) continue;
    if (first === first.toUpperCase() && first !== first.toLowerCase()) {
      names.push(raw.toLowerCase());
    }
  }
  return names;
}

function entityScore(
  memory: MemoryWithTags,
  query: string,
  queryTerms: readonly string[],
): number {
  const tagSet = new Set(contentTokens(memory.tags.join(" "), false));
  const rawQuery = new Set(tokenize(query));
  let tagHits = 0;
  for (const tag of tagSet) {
    if (queryTerms.includes(tag) || rawQuery.has(tag)) tagHits += 1;
  }
  const tagPart = tagSet.size === 0 ? 0 : tagHits / Math.max(tagSet.size, 1);

  const names = properNames(`${memory.title} ${memory.content}`);
  let nameHits = 0;
  for (const name of names) {
    if (rawQuery.has(name) || queryTerms.includes(name)) nameHits += 1;
  }
  const namePart = names.length === 0 ? 0 : nameHits / names.length;
  return clamp01(Math.max(tagPart, namePart, tagHits > 0 ? 0.7 : 0));
}

function recencyScore(memory: MemoryWithTags, nowMs: number): number {
  if (memory.status === "pinned") return 1;
  const updated = Date.parse(memory.updatedAt);
  const created = Date.parse(memory.createdAt);
  const ts = Number.isFinite(updated) ? updated : created;
  if (!Number.isFinite(ts)) return 0.5;
  const ageDays = Math.max(0, (nowMs - ts) / MS_PER_DAY);
  return Math.exp(-ageDays / RECENCY_HALFLIFE_DAYS);
}

function rrfFromScores(
  ids: readonly string[],
  scores: ReadonlyMap<string, number>,
): Map<string, number> {
  const ranked = [...ids].sort(
    (a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0),
  );
  const out = new Map<string, number>();
  for (let i = 0; i < ranked.length; i += 1) {
    const id = ranked[i];
    if (id === undefined) continue;
    if ((scores.get(id) ?? 0) <= 0) continue;
    out.set(id, 1 / (RRF_K + i + 1));
  }
  return out;
}

function addRrf(
  target: Map<string, number>,
  source: ReadonlyMap<string, number>,
): void {
  for (const [id, value] of source) {
    target.set(id, (target.get(id) ?? 0) + value);
  }
}

function normalizeMap(
  values: ReadonlyMap<string, number>,
): Map<string, number> {
  let max = 0;
  for (const value of values.values()) {
    if (value > max) max = value;
  }
  const out = new Map<string, number>();
  if (max <= 0) return out;
  for (const [id, value] of values) {
    out.set(id, value / max);
  }
  return out;
}

function reasonFor(args: {
  query: string;
  fulltext: number;
  vector: number;
  chunk: number;
  entity: number;
  recency: number;
  graph: number;
}): string {
  if (args.query.trim().length === 0) return "recent memories";
  const parts: string[] = [];
  if (args.fulltext >= 0.85) parts.push("exact or phrase match");
  else if (args.fulltext >= 0.35) parts.push("fulltext and synonym match");
  else if (args.fulltext > 0) parts.push("lexical overlap");
  if (args.vector > 0.15) parts.push("vector similarity");
  if (args.chunk > 0.4) parts.push("chunk overlap");
  if (args.entity > 0.3) parts.push("tag or entity match");
  if (args.graph > 0) parts.push("related via stored link");
  if (args.recency > 0.7) parts.push("recency");
  if (parts.length === 0) return "weak lexical match";
  return parts.join("; ");
}

export function memoryMatchesLexical(
  memory: Pick<MemoryWithTags, "title" | "content"> & {
    tags: readonly string[];
  },
  searchQuery: string | undefined,
): boolean {
  const needle = searchQuery?.trim().toLowerCase() ?? "";
  if (needle.length === 0) return true;
  if (haystack(memory).includes(needle)) return true;
  const queryTerms = expandQueryTerms(needle);
  // Stopword-only / emoji-only queries have no tokens. Do not treat that as
  // "match every memory" — substring already had a chance above.
  if (queryTerms.length === 0) return false;
  const docTerms = new Set(
    contentTokens(
      `${memory.title} ${memory.content} ${memory.tags.join(" ")}`,
      false,
    ),
  );
  for (const term of queryTerms) {
    if (docTerms.has(term)) return true;
  }
  return false;
}

export function rankMemories(
  memories: readonly MemoryWithTags[],
  query: string,
  options: RankMemoriesOptions = {},
): MemoryCandidate[] {
  const limit = options.limit ?? memories.length;
  const nowMs = options.nowMs ?? Date.now();
  const trimmed = query.trim();
  const useFulltext = legOn(options.legs, "fulltext");
  const useVector = legOn(options.legs, "vector");
  const useChunk = legOn(options.legs, "chunk");
  const useEntity = legOn(options.legs, "entity");
  const useRecency = legOn(options.legs, "recency");
  const useGraph =
    legOn(options.legs, "graph") &&
    options.links !== undefined &&
    options.links.length > 0;
  const docs = memories.map(tokenizeDoc);
  const byId = new Map(docs.map((doc) => [doc.memory.id, doc]));
  const queryTerms = expandQueryTerms(trimmed);
  const df = new Map<string, number>();
  let lengthSum = 0;
  for (const doc of docs) {
    lengthSum += doc.length;
    const seen = new Set(doc.all);
    for (const term of queryTerms) {
      if (seen.has(term)) df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const avgLength = docs.length === 0 ? 1 : lengthSum / docs.length;
  const fulltextRaw = new Map<string, number>();
  const chunkRaw = new Map<string, number>();
  const entityRaw = new Map<string, number>();
  const recencyRaw = new Map<string, number>();
  const vectorRaw = new Map<string, number>();
  const ftsRaw = new Map<string, number>();
  const graphRaw = new Map<string, number>();
  const graphPath = new Map<
    string,
    { seedTitle: string; bridgingEntity: string | null; hops: number }
  >();
  const breakdown = new Map<
    string,
    {
      fulltext: number;
      vector: number;
      chunk: number;
      entity: number;
      recency: number;
      graph: number;
      confidence: number;
    }
  >();

  for (const doc of docs) {
    const phrase = phraseScore(doc.memory, trimmed);
    const bm25 = bm25Score(doc, queryTerms, df, docs.length, avgLength);
    const fulltext =
      !useFulltext || trimmed.length === 0
        ? 0
        : clamp01(Math.max(phrase, Math.tanh(bm25 / 4)));
    const chunk =
      !useChunk || trimmed.length === 0
        ? 0
        : chunkScore(doc.memory, queryTerms);
    const entity =
      !useEntity || trimmed.length === 0
        ? 0
        : entityScore(doc.memory, trimmed, queryTerms);
    const recency = useRecency ? recencyScore(doc.memory, nowMs) : 0;
    const vector = useVector
      ? clamp01(options.vectorScores?.get(doc.memory.id) ?? 0)
      : 0;
    const fts = useFulltext ? options.ftsRanks?.get(doc.memory.id) : undefined;
    fulltextRaw.set(doc.memory.id, fulltext);
    chunkRaw.set(doc.memory.id, chunk);
    entityRaw.set(doc.memory.id, entity);
    recencyRaw.set(doc.memory.id, recency);
    vectorRaw.set(doc.memory.id, vector);
    if (fts !== undefined && fts > 0) ftsRaw.set(doc.memory.id, fts);
    breakdown.set(doc.memory.id, {
      fulltext,
      vector,
      chunk,
      entity,
      recency,
      graph: 0,
      confidence: doc.memory.confidence,
    });
  }

  const ids = docs.map((doc) => doc.memory.id);
  const seedRrf = new Map<string, number>();
  if (trimmed.length === 0) {
    addRrf(seedRrf, rrfFromScores(ids, recencyRaw));
  } else {
    if (useFulltext) {
      addRrf(seedRrf, rrfFromScores(ids, fulltextRaw));
      addRrf(seedRrf, rrfFromScores(ids, ftsRaw));
    }
    if (useChunk) addRrf(seedRrf, rrfFromScores(ids, chunkRaw));
    if (useEntity) addRrf(seedRrf, rrfFromScores(ids, entityRaw));
    if (useVector) addRrf(seedRrf, rrfFromScores(ids, vectorRaw));
  }

  if (useGraph && options.links !== undefined && trimmed.length > 0) {
    const seedOrder = [...ids].sort(
      (a, b) => (seedRrf.get(b) ?? 0) - (seedRrf.get(a) ?? 0),
    );
    const seedIds = seedOrder.slice(0, GRAPH_SEED_LIMIT);
    const seedTitleById = new Map(
      seedIds.map((id) => [id, byId.get(id)?.memory.title ?? id]),
    );
    const neighbors = expandGraphNeighbors(
      seedIds,
      seedTitleById,
      options.links,
      GRAPH_NEIGHBOR_LIMIT,
    );
    for (let i = 0; i < neighbors.length; i += 1) {
      const neighbor = neighbors[i];
      if (neighbor === undefined) continue;
      graphRaw.set(neighbor.id, 1 / (i + 1));
      graphPath.set(neighbor.id, {
        seedTitle: neighbor.seedTitle,
        bridgingEntity: neighbor.reason,
        hops: neighbor.hops,
      });
      const parts = breakdown.get(neighbor.id);
      if (parts) parts.graph = clamp01(1 / (neighbor.hops + i * 0.05));
    }
  }

  const rrf = new Map<string, number>();
  addRrf(rrf, seedRrf);
  if (useGraph) addRrf(rrf, rrfFromScores(ids, graphRaw));
  const rrfNorm = normalizeMap(rrf);

  const scored: MemoryCandidate[] = [];
  for (const doc of docs) {
    const parts = breakdown.get(doc.memory.id);
    if (parts === undefined) continue;
    const rrfScore = rrfNorm.get(doc.memory.id) ?? 0;
    const relevant =
      trimmed.length === 0 ||
      parts.fulltext > 0 ||
      parts.vector > 0.05 ||
      parts.entity > 0 ||
      parts.chunk > 0 ||
      parts.graph > 0;
    if (!relevant) continue;
    const blended =
      0.28 * parts.fulltext +
      0.14 * rrfScore +
      0.2 * parts.vector +
      0.1 * parts.chunk +
      0.08 * parts.entity +
      0.16 * parts.graph +
      0.04 * parts.recency;
    const recencyMultiplier = useRecency ? 0.7 + 0.3 * parts.recency : 1;
    const score =
      trimmed.length === 0
        ? parts.recency
        : clamp01(blended * recencyMultiplier);
    const path = graphPath.get(doc.memory.id);
    scored.push({
      ...doc.memory,
      trace: {
        score,
        scoreBreakdown: {
          fulltext: parts.fulltext,
          vector: parts.vector,
          chunk: parts.chunk,
          entity: parts.entity,
          rrf: rrfScore,
          recency: parts.recency,
          confidence: parts.confidence,
          ...(path === undefined ? {} : { graphPath: path }),
        },
        reason: reasonFor({
          query: trimmed,
          fulltext: parts.fulltext,
          vector: parts.vector,
          chunk: parts.chunk,
          entity: parts.entity,
          recency: parts.recency,
          graph: parts.graph,
        }),
      },
    });
  }

  if (useGraph && trimmed.length > 0) {
    const byHitId = new Map(scored.map((hit) => [hit.id, hit]));
    const strongSeeds = [...scored]
      .filter((hit) => hit.trace.score >= GRAPH_SEED_SCORE_FLOOR)
      .sort((a, b) => b.trace.score - a.trace.score)
      .slice(0, GRAPH_SEED_LIMIT);
    for (const neighbor of expandGraphNeighbors(
      strongSeeds.map((seed) => seed.id),
      new Map(strongSeeds.map((seed) => [seed.id, seed.title])),
      options.links ?? [],
      GRAPH_NEIGHBOR_LIMIT,
    )) {
      const seedScore = byHitId.get(neighbor.seedId)?.trace.score ?? 0;
      const boosted = clamp01(seedScore * GRAPH_NEIGHBOR_FROM_SEED);
      const path = {
        seedTitle: neighbor.seedTitle,
        bridgingEntity: neighbor.reason,
        hops: neighbor.hops,
      };
      const existing = byHitId.get(neighbor.id);
      if (existing === undefined) {
        const doc = byId.get(neighbor.id);
        if (doc === undefined) continue;
        const parts = breakdown.get(neighbor.id);
        const hit: MemoryCandidate = {
          ...doc.memory,
          trace: {
            score: boosted,
            scoreBreakdown: {
              fulltext: parts?.fulltext ?? 0,
              vector: parts?.vector ?? 0,
              chunk: parts?.chunk ?? 0,
              entity: parts?.entity ?? 0,
              rrf: rrfNorm.get(neighbor.id) ?? 0,
              recency: parts?.recency ?? 0,
              confidence: doc.memory.confidence,
              graphPath: path,
            },
            reason: "related via stored link",
          },
        };
        scored.push(hit);
        byHitId.set(hit.id, hit);
        continue;
      }
      if (boosted > existing.trace.score) {
        existing.trace.score = boosted;
      }
      existing.trace.scoreBreakdown = {
        ...existing.trace.scoreBreakdown,
        graphPath: path,
      };
      if (!existing.trace.reason.includes("related via stored link")) {
        existing.trace.reason = `${existing.trace.reason}; related via stored link`;
      }
    }
  }

  scored.sort((a, b) => {
    if (b.trace.score !== a.trace.score) return b.trace.score - a.trace.score;
    if (b.trace.scoreBreakdown.rrf !== a.trace.scoreBreakdown.rrf) {
      return b.trace.scoreBreakdown.rrf - a.trace.scoreBreakdown.rrf;
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
  return scored.slice(0, Math.max(0, limit));
}

export function relatedMemories(
  seed: MemoryWithTags,
  pool: readonly MemoryWithTags[],
  limit: number = 10,
): RelatedMemoryHit[] {
  const seedTags = new Set(seed.tags);
  const seedTerms = new Set(
    contentTokens(`${seed.title} ${seed.content}`, true),
  );
  const hits: RelatedMemoryHit[] = [];
  for (const memory of pool) {
    if (memory.id === seed.id) continue;
    const tags = memory.tags;
    let shared = 0;
    for (const tag of tags) {
      if (seedTags.has(tag)) shared += 1;
    }
    const tagScore =
      seedTags.size === 0 && tags.length === 0
        ? 0
        : shared / Math.max(1, new Set([...seedTags, ...tags]).size);
    const terms = contentTokens(`${memory.title} ${memory.content}`, true);
    let overlap = 0;
    for (const term of terms) {
      if (seedTerms.has(term)) overlap += 1;
    }
    const lexical =
      terms.length === 0 ? 0 : overlap / Math.max(seedTerms.size, terms.length);
    const score = 0.7 * tagScore + 0.3 * lexical;
    if (score <= 0) continue;
    const reasons: string[] = [];
    if (shared > 0)
      reasons.push(
        `shared tags: ${tags.filter((tag) => seedTags.has(tag)).join(", ")}`,
      );
    if (lexical > 0.15) reasons.push("similar title or content");
    hits.push({
      memory,
      reason: reasons.join("; ") || "related memory",
      score,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, Math.max(0, limit));
}
