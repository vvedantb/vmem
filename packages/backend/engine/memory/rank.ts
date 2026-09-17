import type { MemoryCandidate, MemoryWithTags } from "@vmem/sdk";
import { expandGraphNeighbors, type MemoryLinkEdge } from "./links";
import { expandQueryTerms, phraseAwareQueryTokens } from "./synonyms";
import {
  classifyQueryTemporal,
  hasTemporalIntent,
  temporalScore,
} from "./temporal";
import { contentTokens, hasWholeWord, tokenize } from "./tokens";

const BM25_K1 = 1.4;
const BM25_B = 0.6;
const RRF_K = 24;
const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 2;
const RECENCY_HALFLIFE_DAYS = 365;
const MS_PER_DAY = 86_400_000;
const GRAPH_SEED_LIMIT = 8;
const GRAPH_NEIGHBOR_LIMIT = 64;
const GRAPH_MAX_HOPS = 2;
const GRAPH_SEED_SCORE_FLOOR = 0.22;
const GRAPH_ENTITY_SEED_FLOOR = 0.12;
const GRAPH_NEIGHBOR_FROM_SEED = 0.97;
const GRAPH_HOP2_DECAY = 0.94;
const GRAPH_AFFINITY_PROMOTE = 0.85;
const GRAPH_WHO_PROMOTE_1HOP = 1.05;
const GRAPH_WHO_PROMOTE_2HOP = 1.03;
const RRF_WEIGHT = {
  fulltext: 1.05,
  fts: 0.7,
  chunk: 0.4,
  entity: 0.85,
  vector: 1.15,
} as const;

export interface RetrievalLegs {
  fulltext?: boolean;
  vector?: boolean;
  chunk?: boolean;
  entity?: boolean;
  graph?: boolean;
  recency?: boolean;
  temporal?: boolean;
}

export interface RankMemoriesOptions {
  limit?: number;
  nowMs?: number;
  vectorScores?: ReadonlyMap<string, number>;
  ftsRanks?: ReadonlyMap<string, number>;
  legs?: RetrievalLegs;
  links?: readonly MemoryLinkEdge[];
  threshold?: number;
  rerank?: boolean;
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

function phraseScore(
  memory: MemoryWithTags,
  query: string,
  coreTerms: readonly string[],
  rareTerms: readonly string[],
): number {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return 0;
  const title = memory.title.toLowerCase();
  const content = memory.content.toLowerCase();
  const tagHay = memory.tags.join(" ").toLowerCase();
  if (title.includes(needle)) return 1;
  if (content.includes(needle)) return 0.86;
  if (coreTerms.length === 0) return 0;
  const titleSet = new Set([
    ...contentTokens(memory.title, true),
    ...contentTokens(memory.tags.join(" "), false),
  ]);
  const contentSet = new Set(contentTokens(memory.content, true));
  let titleHits = 0;
  let contentHits = 0;
  for (const token of coreTerms) {
    if (titleSet.has(token)) titleHits += 1;
    if (contentSet.has(token)) contentHits += 1;
  }
  if (titleHits === coreTerms.length) return 1;
  if (contentHits === coreTerms.length) return 0.86;
  const titleFrac = titleHits / coreTerms.length;
  const contentFrac = contentHits / coreTerms.length;
  let score = 0;
  if (titleFrac >= 0.5) score = 0.45 + 0.5 * titleFrac;
  else if (contentFrac >= 0.5) score = 0.3 + 0.3 * contentFrac;
  else if (titleFrac > 0) score = 0.2 * titleFrac;
  const hay = `${title} ${content} ${tagHay}`;
  let missingRare = 0;
  for (const term of rareTerms) {
    if (
      !hasWholeWord(hay, term) &&
      !titleSet.has(term) &&
      !contentSet.has(term)
    ) {
      missingRare += 1;
    }
  }
  if (rareTerms.length > 0 && missingRare === 0) {
    score = Math.max(score, 0.72);
  } else if (missingRare > 0) {
    score *= 0.55;
  }
  return score;
}

function chunkWindows(text: string): string[] {
  const sentences = text
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const tokens = text.split(/\s+/).filter((part) => part.length > 0);
  const windows: string[] = [];
  const size = 40;
  const hop = 20;
  for (let i = 0; i < tokens.length; i += hop) {
    windows.push(tokens.slice(i, i + size).join(" "));
    if (i + size >= tokens.length) break;
  }
  return [...sentences, ...windows];
}

function bestChunk(
  memory: MemoryWithTags,
  queryTerms: readonly string[],
): { score: number; content: string; position: number } {
  if (queryTerms.length === 0) {
    return { score: 0, content: "", position: 0 };
  }
  const chunks = [memory.title, ...chunkWindows(memory.content)];
  let best = { score: 0, content: memory.title, position: 0 };
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (chunk === undefined || chunk.length === 0) continue;
    const tokens = new Set(contentTokens(chunk, true));
    if (tokens.size === 0) continue;
    let hits = 0;
    for (const term of queryTerms) {
      if (tokens.has(term)) hits += 1;
    }
    const overlap = hits / queryTerms.length;
    if (overlap > best.score) {
      best = { score: overlap, content: chunk, position: i };
    }
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
  rareTerms: readonly string[],
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
  const hay = `${memory.title} ${memory.content} ${memory.tags.join(" ")}`;
  let rarePart = 0;
  for (const term of rareTerms) {
    if (term.length < 3) continue;
    const whole = hasWholeWord(hay, term);
    const tagged = tagSet.has(term);
    if (!whole && !tagged) continue;
    rarePart = Math.max(rarePart, whole ? 1 : 0.75);
  }
  return clamp01(Math.max(tagPart, namePart, rarePart));
}

function isResidenceQuery(query: string): boolean {
  return /\b(live|lives|lived)\b/i.test(query);
}

function hasResidenceFact(memory: MemoryWithTags): boolean {
  return /\b(lives? in|based in)\b/i.test(`${memory.title} ${memory.content}`);
}

function typeIntentScore(query: string, memory: MemoryWithTags): number {
  const q = query.toLowerCase();
  if (/\b(prefer|prefers|preferred|preference|favorite|favourite)\b/.test(q)) {
    return memory.type === "profile" ? 1 : 0;
  }
  if (isResidenceQuery(q)) {
    if (memory.type === "profile" && hasResidenceFact(memory)) return 1;
    if (hasResidenceFact(memory)) return 0.25;
    if (memory.type === "profile") return 0.15;
    return 0;
  }
  if (/\b(met|yesterday|last (week|month)|booked|flew|trip)\b/.test(q)) {
    return memory.type === "episodic" ? 1 : 0;
  }
  return 0;
}

function graphNeighborAffinity(query: string, memory: MemoryWithTags): number {
  if (!/\bwho\b/i.test(query)) return 0.55;
  if (memory.tags.some((tag) => tag === "people" || tag === "person")) {
    return 1;
  }
  if (
    /^(?:[A-Z][a-z]+)(?:\s+and\s+[A-Z][a-z]+)?\s+(?:is|are|covers|leads?|owns|chairs|runs|manages|carries|acknowledges)\b/.test(
      memory.title,
    )
  ) {
    return 1;
  }
  return 0.2;
}

function maxHitScore(hits: readonly MemoryCandidate[]): number {
  let max = 0;
  for (const hit of hits) {
    if (hit.trace.score > max) max = hit.trace.score;
  }
  return max;
}

function graphBoostFromSeed(
  seedScore: number,
  hops: number,
  affinity: number,
  scoreCeiling: number,
  seedIsRareEntity: boolean,
  topScore: number,
): number {
  const hopDecay = hops <= 1 ? 1 : GRAPH_HOP2_DECAY;
  if (affinity >= GRAPH_AFFINITY_PROMOTE && seedIsRareEntity) {
    const promote = hops <= 1 ? GRAPH_WHO_PROMOTE_1HOP : GRAPH_WHO_PROMOTE_2HOP;
    const fromSeed = seedScore * promote;
    const rankFloor = topScore > 0 ? topScore * 0.91 : 0;
    return clamp01(Math.max(fromSeed, rankFloor));
  }
  return clamp01(
    Math.min(
      seedScore * GRAPH_NEIGHBOR_FROM_SEED * hopDecay * (0.7 + 0.3 * affinity),
      scoreCeiling,
    ),
  );
}

function pickGraphSeeds(
  scored: readonly MemoryCandidate[],
  hasRare: (id: string) => boolean,
  hasLongRare: (id: string) => boolean,
  hasRarestEntity: (id: string) => boolean,
): MemoryCandidate[] {
  const strongSeeds = [...scored]
    .filter((hit) => {
      const floor = hasRare(hit.id)
        ? GRAPH_ENTITY_SEED_FLOOR
        : GRAPH_SEED_SCORE_FLOOR;
      return hit.trace.score >= floor;
    })
    .sort((a, b) => {
      const rarestDelta =
        Number(hasRarestEntity(b.id)) - Number(hasRarestEntity(a.id));
      if (rarestDelta !== 0) return rarestDelta;
      const longRareDelta =
        Number(hasLongRare(b.id)) - Number(hasLongRare(a.id));
      if (longRareDelta !== 0) return longRareDelta;
      const rareDelta = Number(hasRare(b.id)) - Number(hasRare(a.id));
      if (rareDelta !== 0) return rareDelta;
      return b.trace.score - a.trace.score;
    });
  const rarestSeeds = strongSeeds.filter((hit) => hasRarestEntity(hit.id));
  if (rarestSeeds.length > 0) {
    return rarestSeeds.slice(0, GRAPH_SEED_LIMIT);
  }
  const picked: MemoryCandidate[] = [];
  const seen = new Set<string>();
  for (const hit of strongSeeds) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    picked.push(hit);
    if (picked.length >= GRAPH_SEED_LIMIT) break;
  }
  return picked;
}

function rareQueryTerms(
  terms: readonly string[],
  df: ReadonlyMap<string, number>,
  docCount: number,
): string[] {
  const maxDf = Math.max(3, Math.floor(docCount * 0.02));
  const rare: string[] = [];
  for (const term of terms) {
    if (term.length < 4 && !/\d/.test(term)) continue;
    const docsWith = df.get(term) ?? 0;
    if (docsWith > 0 && docsWith <= maxDf) rare.push(term);
  }
  return rare;
}

function coreCoverage(
  memory: MemoryWithTags,
  coreTerms: readonly string[],
): { title: number; content: number } {
  if (coreTerms.length === 0) return { title: 0, content: 0 };
  const titleSet = new Set([
    ...contentTokens(memory.title, true),
    ...contentTokens(memory.tags.join(" "), false),
  ]);
  const contentSet = new Set(contentTokens(memory.content, true));
  let titleHits = 0;
  let contentHits = 0;
  for (const term of coreTerms) {
    if (titleSet.has(term)) titleHits += 1;
    if (contentSet.has(term)) contentHits += 1;
  }
  return {
    title: titleHits / coreTerms.length,
    content: contentHits / coreTerms.length,
  };
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
  weight: number = 1,
): Map<string, number> {
  const ranked = [...ids].sort(
    (a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0),
  );
  const out = new Map<string, number>();
  for (let i = 0; i < ranked.length; i += 1) {
    const id = ranked[i];
    if (id === undefined) continue;
    if ((scores.get(id) ?? 0) <= 0) continue;
    out.set(id, weight / (RRF_K + i + 1));
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
  temporal: number;
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
  if (args.temporal > 0.45) parts.push("temporal match");
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
  const coreTerms = phraseAwareQueryTokens(trimmed);
  const queryTerms = expandQueryTerms(trimmed);
  const extraTerms = queryTerms.filter((term) => !coreTerms.includes(term));
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
  const rareTerms = rareQueryTerms(coreTerms, df, docs.length);
  const useTemporal = legOn(options.legs, "temporal");
  const queryTemporal = classifyQueryTemporal(trimmed, nowMs);
  const temporalQuery = hasTemporalIntent(queryTemporal);
  const fulltextRaw = new Map<string, number>();
  const chunkRaw = new Map<string, number>();
  const entityRaw = new Map<string, number>();
  const recencyRaw = new Map<string, number>();
  const vectorRaw = new Map<string, number>();
  const ftsRaw = new Map<string, number>();
  const chunkHit = new Map<
    string,
    { content: string; position: number; score: number }
  >();
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
      typeIntent: number;
      residence: number;
      temporal: number;
      confidence: number;
    }
  >();

  for (const doc of docs) {
    const phrase = phraseScore(doc.memory, trimmed, coreTerms, rareTerms);
    const bm25Core = bm25Score(doc, coreTerms, df, docs.length, avgLength);
    const bm25Extra =
      extraTerms.length === 0
        ? 0
        : bm25Score(doc, extraTerms, df, docs.length, avgLength);
    const fulltextRawScore =
      !useFulltext || trimmed.length === 0
        ? 0
        : clamp01(
            Math.max(phrase, Math.tanh((bm25Core + 0.4 * bm25Extra) / 4)),
          );
    const fulltext =
      isResidenceQuery(trimmed) && !hasResidenceFact(doc.memory)
        ? fulltextRawScore * 0.2
        : fulltextRawScore;
    const chunkBest =
      !useChunk || trimmed.length === 0
        ? { score: 0, content: "", position: 0 }
        : bestChunk(doc.memory, coreTerms.length > 0 ? coreTerms : queryTerms);
    const entity =
      !useEntity || trimmed.length === 0
        ? 0
        : entityScore(doc.memory, trimmed, queryTerms, rareTerms);
    const recency = useRecency ? recencyScore(doc.memory, nowMs) : 0;
    const temporal = useTemporal
      ? temporalScore(doc.memory, queryTemporal, nowMs)
      : 0;
    const vector = useVector
      ? clamp01(options.vectorScores?.get(doc.memory.id) ?? 0)
      : 0;
    const fts = useFulltext ? options.ftsRanks?.get(doc.memory.id) : undefined;
    fulltextRaw.set(doc.memory.id, fulltext);
    chunkRaw.set(doc.memory.id, chunkBest.score);
    entityRaw.set(doc.memory.id, entity);
    recencyRaw.set(doc.memory.id, recency);
    vectorRaw.set(doc.memory.id, vector);
    if (fts !== undefined && fts > 0) ftsRaw.set(doc.memory.id, fts);
    if (chunkBest.score > 0 && chunkBest.content.length > 0) {
      chunkHit.set(doc.memory.id, chunkBest);
    }
    breakdown.set(doc.memory.id, {
      fulltext,
      vector,
      chunk: chunkBest.score,
      entity,
      recency,
      graph: 0,
      typeIntent: typeIntentScore(trimmed, doc.memory),
      residence:
        isResidenceQuery(trimmed) && hasResidenceFact(doc.memory) ? 1 : 0,
      temporal,
      confidence: doc.memory.confidence,
    });
  }

  const ids = docs.map((doc) => doc.memory.id);
  const seedRrf = new Map<string, number>();
  if (trimmed.length === 0) {
    addRrf(seedRrf, rrfFromScores(ids, recencyRaw));
  } else {
    if (useFulltext) {
      addRrf(seedRrf, rrfFromScores(ids, fulltextRaw, RRF_WEIGHT.fulltext));
      addRrf(seedRrf, rrfFromScores(ids, ftsRaw, RRF_WEIGHT.fts));
    }
    if (useChunk)
      addRrf(seedRrf, rrfFromScores(ids, chunkRaw, RRF_WEIGHT.chunk));
    if (useEntity)
      addRrf(seedRrf, rrfFromScores(ids, entityRaw, RRF_WEIGHT.entity));
    if (useVector)
      addRrf(seedRrf, rrfFromScores(ids, vectorRaw, RRF_WEIGHT.vector));
  }

  const rareSet = new Set(rareTerms);
  const hasRare = (id: string): boolean => {
    const doc = byId.get(id);
    if (doc === undefined || rareSet.size === 0) return false;
    for (const term of rareSet) {
      if (doc.all.includes(term)) return true;
    }
    return false;
  };
  const hasLongRare = (id: string): boolean => {
    const doc = byId.get(id);
    if (doc === undefined || rareSet.size === 0) return false;
    for (const term of rareSet) {
      if (term.length >= 5 && doc.all.includes(term)) return true;
    }
    return false;
  };
  const rarestLongTerms = ((): string[] => {
    const longs = rareTerms.filter((term) => term.length >= 5);
    let bestDf = Infinity;
    let bestLen = 0;
    for (const term of longs) {
      const docsWith = df.get(term) ?? 0;
      if (docsWith <= 0) continue;
      if (docsWith < bestDf || (docsWith === bestDf && term.length > bestLen)) {
        bestDf = docsWith;
        bestLen = term.length;
      }
    }
    if (!Number.isFinite(bestDf)) return [];
    return longs.filter(
      (term) => (df.get(term) ?? 0) === bestDf && term.length === bestLen,
    );
  })();
  const hasRarestEntity = (id: string): boolean => {
    const doc = byId.get(id);
    if (doc === undefined || rarestLongTerms.length === 0) return false;
    for (const term of rarestLongTerms) {
      if (doc.all.includes(term)) return true;
    }
    return false;
  };

  const rrf = new Map<string, number>();
  addRrf(rrf, seedRrf);
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
      parts.graph > 0 ||
      parts.residence > 0;
    if (!relevant) continue;
    const blended =
      0.28 * parts.fulltext +
      0.16 * rrfScore +
      0.22 * parts.vector +
      0.08 * parts.chunk +
      0.12 * parts.entity +
      0.1 * parts.typeIntent +
      0.2 * parts.residence;
    const recencyMultiplier = useRecency
      ? temporalQuery
        ? 0.6 + 0.4 * parts.recency
        : 0.82 + 0.18 * parts.recency
      : 1;
    const firstPass =
      trimmed.length === 0
        ? parts.recency
        : clamp01(blended * recencyMultiplier + 0.22 * parts.temporal);
    const cover = coreCoverage(doc.memory, coreTerms);
    const titleCover =
      isResidenceQuery(trimmed) && parts.residence === 0
        ? cover.title * 0.15
        : cover.title;
    const rerank = clamp01(
      0.45 * titleCover +
        0.15 * cover.content +
        0.15 * parts.entity +
        0.1 * parts.vector +
        0.15 * parts.typeIntent +
        0.25 * parts.residence +
        0.2 * parts.temporal,
    );
    const score =
      parts.graph > 0
        ? Math.max(firstPass, clamp01(0.75 * firstPass + 0.25 * rerank))
        : clamp01(0.7 * firstPass + 0.3 * rerank);
    const path = graphPath.get(doc.memory.id);
    const chunk = chunkHit.get(doc.memory.id);
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
          temporal: parts.temporal,
          confidence: parts.confidence,
          rerankerScore: rerank,
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
          temporal: parts.temporal,
        }),
      },
      ...(chunk === undefined
        ? {}
        : {
            matchedChunk: {
              content: chunk.content,
              position: chunk.position,
            },
          }),
    });
  }

  if (useGraph && trimmed.length > 0) {
    const byHitId = new Map(scored.map((hit) => [hit.id, hit]));
    const seedsForGraph = pickGraphSeeds(
      scored,
      hasRare,
      hasLongRare,
      hasRarestEntity,
    );
    const topScore = maxHitScore(scored);
    const scoreCeiling = topScore * 0.98;
    for (const neighbor of expandGraphNeighbors(
      seedsForGraph.map((seed) => seed.id),
      new Map(seedsForGraph.map((seed) => [seed.id, seed.title])),
      options.links ?? [],
      GRAPH_NEIGHBOR_LIMIT,
      GRAPH_MAX_HOPS,
    )) {
      const seedScore = byHitId.get(neighbor.seedId)?.trace.score ?? 0;
      const neighborDoc = byId.get(neighbor.id);
      const affinity =
        neighborDoc === undefined
          ? 0.55
          : graphNeighborAffinity(trimmed, neighborDoc.memory);
      const boosted = graphBoostFromSeed(
        seedScore,
        neighbor.hops,
        affinity,
        scoreCeiling,
        hasRarestEntity(neighbor.seedId),
        topScore,
      );
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
              temporal: parts?.temporal ?? 0,
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

  if (options.rerank === true && trimmed.length > 0 && scored.length > 1) {
    const headCount = Math.min(20, scored.length);
    const head = scored.slice(0, headCount);
    const tail = scored.slice(headCount);
    for (const hit of head) {
      const temporal = hit.trace.scoreBreakdown.temporal ?? 0;
      const extra = clamp01(hit.trace.score + 0.22 * temporal);
      hit.trace.scoreBreakdown.rerankerScore = extra;
      hit.trace.score = extra;
    }
    head.sort((a, b) => {
      const aRerank = a.trace.scoreBreakdown.rerankerScore ?? a.trace.score;
      const bRerank = b.trace.scoreBreakdown.rerankerScore ?? b.trace.score;
      if (bRerank !== aRerank) return bRerank - aRerank;
      return b.trace.score - a.trace.score;
    });
    scored.length = 0;
    scored.push(...head, ...tail);
  }

  const threshold = options.threshold;
  const kept =
    threshold === undefined
      ? scored
      : scored.filter((hit) => hit.trace.score >= threshold);
  return kept.slice(0, Math.max(0, limit));
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
