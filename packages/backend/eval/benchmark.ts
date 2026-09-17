import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pRetry from "p-retry";
import type { RetrievalLegs } from "../engine/memory/rank";
import {
  generateBenchmarkCorpus,
  type BenchmarkCorpus,
  type RetrievalEvalQuery,
} from "./corpus";
import { generateHardCorpus } from "./hard-corpus";
import { generateTailCorpus } from "./tail-corpus";
import { embeddingMode, generateEvalEmbeddings } from "./embeddings";
import { buildSearchableText } from "../engine/memory/searchableText";
import { queryEmbeddingText } from "../engine/memory/synonyms";
import {
  evaluateSystemOne,
  readSystemOneApiKey,
  type EvaluateSystemOneArgs,
  type SystemOneResponse,
} from "../engine/llm/systemOneClient";
import { DEFAULT_JEV_RELEVANCE_THRESHOLD } from "../engine/memory/jevGate";
import {
  INDEX_RETRIEVE_CAPS,
  LEGACY_RETRIEVE_CAPS,
  type RetrieveCandidateCaps,
} from "../engine/memory/retrieveCaps";
import {
  mean,
  ndcgAtK,
  percentile,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "./metrics";
import {
  EVAL_JEV_KEY_REQUIRED,
  EVAL_K,
  autoLinksFromCorpus,
  evalJevConcurrency,
  evalWantsJev,
  linksFromCorpus,
  retrieveEval,
  rankEvalRetrieve,
  toEvalMemory,
  type EvalJudge,
  type RetrieveEvalRerank,
} from "./retrieve";
import type { MemoryLinkEdge } from "../engine/memory/links";

interface LegConfig {
  name: string;
  legs: RetrievalLegs;
  judge?: EvalJudge;
  rerank?: RetrieveEvalRerank;
}

// Neo4j-era production retrieveMemories, 2026-07-18, OpenRouter embeddings.
export const NEO4J_FULL_HYBRID = {
  recall1: 0.724,
  recall3: 0.901,
  recall5: 0.92,
  recall10: 0.933,
  precision5: 0.264,
  mrr: 0.974,
  ndcg10: 0.857,
};

// Full hybrid on generateHardCorpus() before this ranking pass (synthetic embeddings).
export const HARD_FULL_HYBRID_BEFORE: Pick<
  AggMetrics,
  "recall5" | "mrr" | "ndcg10"
> = {
  recall5: 0.781,
  mrr: 0.703,
  ndcg10: 0.674,
};

const NEO4J_ABLATION: Record<
  string,
  { recall1: number; recall5: number; mrr: number; ndcg10: number }
> = {
  "vector-only": { recall1: 0.718, recall5: 0.917, mrr: 0.971, ndcg10: 0.841 },
  "bm25-only": { recall1: 0.647, recall5: 0.84, mrr: 0.913, ndcg10: 0.792 },
  "hybrid (no graph)": {
    recall1: 0.731,
    recall5: 0.917,
    mrr: 0.981,
    ndcg10: 0.852,
  },
  "full hybrid": {
    recall1: 0.724,
    recall5: 0.92,
    mrr: 0.974,
    ndcg10: 0.857,
  },
};

export const EVAL_CONFIGS: LegConfig[] = [
  {
    name: "vector-only",
    legs: {
      vector: true,
      fulltext: false,
      chunk: false,
      entity: false,
      graph: false,
      recency: false,
      temporal: false,
    },
  },
  {
    name: "bm25-only",
    legs: {
      fulltext: true,
      vector: false,
      chunk: false,
      entity: false,
      graph: false,
      recency: false,
      temporal: false,
    },
  },
  {
    name: "hybrid (no graph)",
    legs: { graph: false },
  },
  {
    name: "hybrid (no temporal)",
    legs: { temporal: false },
  },
  { name: "full hybrid", legs: {} },
];

const TYPE_ORDER = [
  "single-fact",
  "preference",
  "exact-match",
  "project",
  "lexical-trap",
  "update",
  "multi-hop",
  "paraphrase",
  "long-tail",
  "multi-hop-2",
  "tag-conflict",
  "tag-filter",
  "type-intent",
  "type-filter",
  "distractor",
  "tail-gold",
  "temporal",
];

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface QueryOutcome {
  type: string;
  query: string;
  titles: string[];
  recall1: number;
  recall3: number;
  recall5: number;
  recall10: number;
  precision5: number;
  rr: number;
  ndcg10: number;
  ctxTokens: number;
  latencyMs: number;
  topScore: number;
  jevFailOpen: boolean;
  empty: boolean;
}

interface JevCallStats {
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  nearTies: number;
  dropped: number;
}

export interface ConfigRun {
  name: string;
  outcomes: QueryOutcome[];
  abstentionTopScores: number[];
  abstentionEmpty: number;
  jev?: JevCallStats;
}

export interface AggMetrics {
  recall1: number;
  recall3: number;
  recall5: number;
  recall10: number;
  precision5: number;
  mrr: number;
  ndcg10: number;
  meanCtxTokens: number;
  latencyP50: number;
  latencyP95: number;
}

export function aggregate(outcomes: QueryOutcome[]): AggMetrics {
  const latencies = outcomes.map((o) => o.latencyMs);
  return {
    recall1: mean(outcomes.map((o) => o.recall1)),
    recall3: mean(outcomes.map((o) => o.recall3)),
    recall5: mean(outcomes.map((o) => o.recall5)),
    recall10: mean(outcomes.map((o) => o.recall10)),
    precision5: mean(outcomes.map((o) => o.precision5)),
    mrr: mean(outcomes.map((o) => o.rr)),
    ndcg10: mean(outcomes.map((o) => o.ndcg10)),
    meanCtxTokens: mean(outcomes.map((o) => o.ctxTokens)),
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signedPct(value: number): string {
  const shown = `${(value * 100).toFixed(1)}%`;
  return value >= 0 ? `+${shown}` : shown;
}

function signedFixed(value: number): string {
  const shown = value.toFixed(3);
  return value >= 0 ? `+${shown}` : shown;
}

function mdTable(header: string[], rows: string[][]): string {
  return [header, header.map(() => "---"), ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

function presentTypes(answerable: RetrievalEvalQuery[]): string[] {
  const seen = new Set(answerable.map((q) => q.type));
  const ordered = TYPE_ORDER.filter((t) => seen.has(t));
  const extra = [...seen].filter((t) => !TYPE_ORDER.includes(t)).sort();
  return [...ordered, ...extra];
}

function perTypeTable(
  runs: ConfigRun[],
  answerable: RetrievalEvalQuery[],
  metric: (m: AggMetrics) => string,
): string {
  const types = presentTypes(answerable);
  const header = ["type", "n", ...runs.map((r) => r.name)];
  const rows = types.map((type) => {
    const n = answerable.filter((q) => q.type === type).length;
    const cells = runs.map((r) =>
      metric(aggregate(r.outcomes.filter((o) => o.type === type))),
    );
    return [type, String(n), ...cells];
  });
  return mdTable(header, rows);
}

export function buildEvalReport(
  runs: ConfigRun[],
  corpus: { tokens: number; memoryCount: number },
  answerable: RetrievalEvalQuery[],
  abstention: RetrievalEvalQuery[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  const overall = runs.map((r) => ({
    name: r.name,
    agg: aggregate(r.outcomes),
  }));
  const overallTable = mdTable(
    [
      "Config",
      "recall@1",
      "recall@3",
      "recall@5",
      "recall@10",
      "P@5",
      "MRR",
      "nDCG@10",
      "ctx tok",
      "p50 ms",
      "p95 ms",
    ],
    overall.map(({ name, agg }) => [
      name,
      pct(agg.recall1),
      pct(agg.recall3),
      pct(agg.recall5),
      pct(agg.recall10),
      pct(agg.precision5),
      agg.mrr.toFixed(3),
      agg.ndcg10.toFixed(3),
      String(Math.round(agg.meanCtxTokens)),
      agg.latencyP50.toFixed(0),
      agg.latencyP95.toFixed(0),
    ]),
  );

  const hybrid = overall.find((r) => r.name === "full hybrid")?.agg;
  const vsNeo4j =
    hybrid === undefined
      ? ""
      : `

## vs Neo4j full hybrid (2026-07-18, OpenRouter embeddings)

Success bar: Convex full hybrid ≥ Neo4j on recall@5, MRR, and nDCG@10.

${mdTable(
  ["Metric", "Neo4j full hybrid", "Convex full hybrid", "Δ"],
  [
    [
      "recall@1",
      pct(NEO4J_FULL_HYBRID.recall1),
      pct(hybrid.recall1),
      signedPct(hybrid.recall1 - NEO4J_FULL_HYBRID.recall1),
    ],
    [
      "recall@3",
      pct(NEO4J_FULL_HYBRID.recall3),
      pct(hybrid.recall3),
      signedPct(hybrid.recall3 - NEO4J_FULL_HYBRID.recall3),
    ],
    [
      "recall@5",
      pct(NEO4J_FULL_HYBRID.recall5),
      pct(hybrid.recall5),
      signedPct(hybrid.recall5 - NEO4J_FULL_HYBRID.recall5),
    ],
    [
      "recall@10",
      pct(NEO4J_FULL_HYBRID.recall10),
      pct(hybrid.recall10),
      signedPct(hybrid.recall10 - NEO4J_FULL_HYBRID.recall10),
    ],
    [
      "P@5",
      pct(NEO4J_FULL_HYBRID.precision5),
      pct(hybrid.precision5),
      signedPct(hybrid.precision5 - NEO4J_FULL_HYBRID.precision5),
    ],
    [
      "MRR",
      NEO4J_FULL_HYBRID.mrr.toFixed(3),
      hybrid.mrr.toFixed(3),
      signedFixed(hybrid.mrr - NEO4J_FULL_HYBRID.mrr),
    ],
    [
      "nDCG@10",
      NEO4J_FULL_HYBRID.ndcg10.toFixed(3),
      hybrid.ndcg10.toFixed(3),
      signedFixed(hybrid.ndcg10 - NEO4J_FULL_HYBRID.ndcg10),
    ],
  ],
)}

### Ablation vs the same Neo4j run

${mdTable(
  [
    "Config",
    "Neo4j R@5",
    "Convex R@5",
    "Neo4j MRR",
    "Convex MRR",
    "Neo4j nDCG@10",
    "Convex nDCG@10",
  ],
  overall.map(({ name, agg }) => {
    const neo = NEO4J_ABLATION[name];
    return [
      name,
      neo === undefined ? "—" : pct(neo.recall5),
      pct(agg.recall5),
      neo === undefined ? "—" : neo.mrr.toFixed(3),
      agg.mrr.toFixed(3),
      neo === undefined ? "—" : neo.ndcg10.toFixed(3),
      agg.ndcg10.toFixed(3),
    ];
  }),
)}`;

  return `# vmem Convex retrieval eval

Generated: ${today} · Corpus: ${String(corpus.memoryCount)} memories · Answerable queries: ${String(answerable.length)} · Abstention queries: ${String(abstention.length)} · Embeddings: ${embeddingMode()}

## Retrieval quality + ablation (Convex ranker, per-leg toggles)

${overallTable}

## nDCG@10 by query type

${perTypeTable(runs, answerable, (m) => m.ndcg10.toFixed(3))}

## Recall@5 by query type

${perTypeTable(runs, answerable, (m) => pct(m.recall5))}
${vsNeo4j}

## Notes

- Legs: \`vector-only\` / \`bm25-only\` are naive single-channel baselines (temporal off). \`hybrid (no graph)\` is lexical+vector+recency+temporal. \`hybrid (no temporal)\` is full hybrid without the event-window leg. \`full hybrid\` adds stored memory links (up to 2 hops) as a second pass.
- Query types: **single-fact / preference** one clear answer. **exact-match** distinctive codes among lookalikes. **project** sibling facts that never repeat the codename. **lexical-trap** repeats a query keyword in a different sense (graded 0). **update** stale vs current, recency separates them. **multi-hop** gold is one stored link from a bridge that shares the query entity. **temporal** event windows / currently vs same-age stale, not list order.
- Pure retrieval metrics + latency. No LLM judge. Neo4j is not used.
- Convex numbers in this environment use deterministic synthetic embeddings unless \`OPENROUTER_API_KEY\` is set. The Neo4j 2026-07-18 bar used OpenRouter \`text-embedding-3-small\`.
`;
}

const JEV_NEAR_TIE_LOW = 0.45;
const JEV_NEAR_TIE_HIGH = 0.55;

function emptyJevCallStats(): JevCallStats {
  return {
    calls: 0,
    failures: 0,
    inputTokens: 0,
    outputTokens: 0,
    nearTies: 0,
    dropped: 0,
  };
}

function wrapLiveJevEvaluate(stats: JevCallStats) {
  return async (args: EvaluateSystemOneArgs): Promise<SystemOneResponse> => {
    try {
      const response = await pRetry(async () => evaluateSystemOne(args), {
        retries: 2,
        minTimeout: 1500,
        factor: 2,
      });
      stats.calls += 1;
      stats.inputTokens += response.usage?.input_tokens ?? 0;
      stats.outputTokens += response.usage?.output_tokens ?? 0;
      for (const answer of Object.values(response.answers)) {
        if (answer.type !== "noul") continue;
        if (answer.noul < DEFAULT_JEV_RELEVANCE_THRESHOLD) {
          stats.dropped += 1;
        }
        if (
          answer.noul >= JEV_NEAR_TIE_LOW &&
          answer.noul <= JEV_NEAR_TIE_HIGH
        ) {
          stats.nearTies += 1;
        }
      }
      return response;
    } catch (error) {
      stats.failures += 1;
      throw error;
    }
  };
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const slots: Array<R | undefined> = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      slots[index] = await fn(item, index);
    }
  };
  const n = Math.max(1, Math.min(concurrency, Math.max(1, items.length)));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return slots.map((row, index) => {
    if (row === undefined) {
      throw new Error(`missing mapPool result at ${String(index)}`);
    }
    return row;
  });
}

export async function runCorpusAblation(
  corpus: BenchmarkCorpus,
  options: {
    caps?: RetrieveCandidateCaps;
    configs?: LegConfig[];
    links?: readonly MemoryLinkEdge[];
    judge?: EvalJudge;
    rerank?: RetrieveEvalRerank;
    jevDefaultOn?: boolean;
    requireJevKey?: boolean;
    jevThreshold?: number;
    apiKey?: string;
    evaluate?: (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse>;
    concurrency?: number;
  } = {},
): Promise<{
  runs: ConfigRun[];
  answerable: RetrievalEvalQuery[];
  abstention: RetrievalEvalQuery[];
  stats: { memoryCount: number; tokens: number };
}> {
  const memories = corpus.memories.map(toEvalMemory);
  const links = options?.links ?? linksFromCorpus(corpus);
  const answerable = corpus.queries.filter((q) => q.expectedTitles.length > 0);
  const abstention = corpus.queries.filter(
    (q) => q.expectedTitles.length === 0,
  );
  const uniqueQueries = [...new Set(corpus.queries.map((q) => q.query))];
  const memoryVectors = await generateEvalEmbeddings(
    memories.map((memory) =>
      buildSearchableText(memory.title, memory.content, memory.tags),
    ),
  );
  const queryVectors = await generateEvalEmbeddings(
    uniqueQueries.map((query) => queryEmbeddingText(query)),
  );
  const memoryEmbeddings = new Map<string, number[]>();
  for (let i = 0; i < memories.length; i += 1) {
    const memory = memories[i];
    const vector = memoryVectors[i];
    if (memory === undefined || vector === undefined) {
      throw new Error(`missing memory embedding at ${String(i)}`);
    }
    memoryEmbeddings.set(memory.id, vector);
  }
  const queryEmbeddings = new Map<string, number[]>();
  for (let i = 0; i < uniqueQueries.length; i += 1) {
    const query = uniqueQueries[i];
    const vector = queryVectors[i];
    if (query === undefined || vector === undefined) {
      throw new Error(`missing query embedding at ${String(i)}`);
    }
    queryEmbeddings.set(query, vector);
  }

  const configs = options.configs ?? EVAL_CONFIGS;
  const nowMs = Date.now();
  const runs: ConfigRun[] = [];
  for (const config of configs) {
    const judge = config.judge ?? options.judge;
    const rerank = config.rerank ?? options.rerank;
    const jev = evalWantsJev({
      judge,
      rerank,
      jevDefaultOn: options.jevDefaultOn,
    });
    const jevStats = jev ? emptyJevCallStats() : undefined;
    const evaluate = jev
      ? (options.evaluate ??
        (jevStats === undefined ? undefined : wrapLiveJevEvaluate(jevStats)))
      : undefined;
    const evalOpts = {
      legs: config.legs,
      memoryEmbeddings,
      links,
      limit: EVAL_K,
      nowMs,
      caps: options.caps,
      judge,
      rerank,
      jevDefaultOn: options.jevDefaultOn,
      requireJevKey: options.requireJevKey,
      jevThreshold: options.jevThreshold,
      apiKey: options.apiKey,
      evaluate,
    };
    const concurrency = options.concurrency ?? evalJevConcurrency();
    const rows = jev
      ? await mapPool(corpus.queries, concurrency, async (query) => {
          const queryEmbedding = queryEmbeddings.get(query.query);
          if (queryEmbedding === undefined) {
            throw new Error(`missing embedding for ${query.query}`);
          }
          const started = performance.now();
          const candidates = await retrieveEval(memories, query.query, {
            ...evalOpts,
            queryEmbedding,
            filter: query.filter,
          });
          return {
            query,
            candidates,
            latencyMs: performance.now() - started,
          };
        })
      : corpus.queries.map((query) => {
          const queryEmbedding = queryEmbeddings.get(query.query);
          if (queryEmbedding === undefined) {
            throw new Error(`missing embedding for ${query.query}`);
          }
          const started = performance.now();
          const candidates = rankEvalRetrieve(memories, query.query, {
            ...evalOpts,
            queryEmbedding,
            filter: query.filter,
          });
          return {
            query,
            candidates,
            latencyMs: performance.now() - started,
          };
        });
    const outcomes: QueryOutcome[] = [];
    const abstentionTopScores: number[] = [];
    let abstentionEmpty = 0;
    for (const row of rows) {
      const titles = row.candidates.map((c) => c.title);
      const jevFailOpen =
        jev &&
        row.candidates.length > 0 &&
        row.candidates.every(
          (hit) => hit.trace.scoreBreakdown.jevRelevant === undefined,
        );
      if (row.query.expectedTitles.length === 0) {
        abstentionTopScores.push(row.candidates[0]?.trace.score ?? 0);
        if (row.candidates.length === 0) abstentionEmpty += 1;
        continue;
      }
      outcomes.push({
        type: row.query.type,
        query: row.query.query,
        titles,
        recall1: recallAtK(titles, row.query.expectedTitles, 1),
        recall3: recallAtK(titles, row.query.expectedTitles, 3),
        recall5: recallAtK(titles, row.query.expectedTitles, 5),
        recall10: recallAtK(titles, row.query.expectedTitles, 10),
        precision5: precisionAtK(titles, row.query.expectedTitles, 5),
        rr: reciprocalRank(titles, row.query.expectedTitles),
        ndcg10: ndcgAtK(
          titles,
          new Map(Object.entries(row.query.relevance)),
          EVAL_K,
        ),
        ctxTokens: row.candidates.reduce(
          (sum, c) => sum + approxTokens(`${c.title} ${c.content}`),
          0,
        ),
        latencyMs: row.latencyMs,
        topScore: row.candidates[0]?.trace.score ?? 0,
        jevFailOpen,
        empty: row.candidates.length === 0,
      });
    }
    runs.push({
      name: config.name,
      outcomes,
      abstentionTopScores,
      abstentionEmpty,
      ...(jevStats === undefined ? {} : { jev: jevStats }),
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }

  const stats = {
    memoryCount: memories.length,
    tokens: memories.reduce(
      (sum, memory) => sum + approxTokens(`${memory.title} ${memory.content}`),
      0,
    ),
  };
  return { runs, answerable, abstention, stats };
}

export async function runAblation(): Promise<{
  runs: ConfigRun[];
  report: string;
  answerable: RetrievalEvalQuery[];
}> {
  const corpus = generateBenchmarkCorpus();
  const { runs, answerable, abstention, stats } =
    await runCorpusAblation(corpus);
  const report = buildEvalReport(runs, stats, answerable, abstention);
  return { runs, report, answerable };
}

export async function runAutoLinkAblation(): Promise<{
  runs: ConfigRun[];
  autoLinkCount: number;
}> {
  const corpus = generateBenchmarkCorpus();
  const autoLinks = autoLinksFromCorpus(corpus);
  const { runs } = await runCorpusAblation(corpus, { links: autoLinks });
  return { runs, autoLinkCount: autoLinks.length };
}

export function buildHardEvalReport(
  runs: ConfigRun[],
  corpus: { tokens: number; memoryCount: number },
  answerable: RetrievalEvalQuery[],
  before?: Pick<AggMetrics, "recall5" | "mrr" | "ndcg10">,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const overall = runs.map((r) => ({
    name: r.name,
    agg: aggregate(r.outcomes),
  }));
  const overallTable = mdTable(
    [
      "Config",
      "recall@1",
      "recall@3",
      "recall@5",
      "recall@10",
      "P@5",
      "MRR",
      "nDCG@10",
    ],
    overall.map(({ name, agg }) => [
      name,
      pct(agg.recall1),
      pct(agg.recall3),
      pct(agg.recall5),
      pct(agg.recall10),
      pct(agg.precision5),
      agg.mrr.toFixed(3),
      agg.ndcg10.toFixed(3),
    ]),
  );
  const hybrid = overall.find((r) => r.name === "full hybrid")?.agg;
  const vsBefore =
    hybrid === undefined || before === undefined
      ? ""
      : `
## vs previous Convex full hybrid on this suite

${mdTable(
  ["Metric", "Before", "After", "Δ"],
  [
    [
      "recall@5",
      pct(before.recall5),
      pct(hybrid.recall5),
      signedPct(hybrid.recall5 - before.recall5),
    ],
    [
      "MRR",
      before.mrr.toFixed(3),
      hybrid.mrr.toFixed(3),
      signedFixed(hybrid.mrr - before.mrr),
    ],
    [
      "nDCG@10",
      before.ndcg10.toFixed(3),
      hybrid.ndcg10.toFixed(3),
      signedFixed(hybrid.ndcg10 - before.ndcg10),
    ],
  ],
)}`;

  return `# vmem Convex hard retrieval eval

Generated: ${today} · Corpus: ${String(corpus.memoryCount)} memories · Answerable queries: ${String(answerable.length)} · Embeddings: ${embeddingMode()}

## Retrieval quality + ablation

${overallTable}

## nDCG@10 by query type

${perTypeTable(runs, answerable, (m) => m.ndcg10.toFixed(3))}

## Recall@5 by query type

${perTypeTable(runs, answerable, (m) => pct(m.recall5))}
${vsBefore}

## Notes

- Query types: **paraphrase** shares little surface form with gold. **long-tail** near-duplicate entity names. **multi-hop-2** gold is two stored links from the query entity. **tag-conflict** staging vs production. **tag-filter / type-filter** apply retrieve filters. **type-intent** must prefer profile without a filter. **distractor** recent keyword traps. **temporal** last-week vs yesterday and currently vs same-age stale.
- Convex-only. No Neo4j. No LLM judge.
`;
}

export async function runHardAblation(
  before?: Pick<AggMetrics, "recall5" | "mrr" | "ndcg10">,
): Promise<{
  runs: ConfigRun[];
  report: string;
  answerable: RetrievalEvalQuery[];
}> {
  const corpus = generateHardCorpus();
  const { runs, answerable, stats } = await runCorpusAblation(corpus);
  const report = buildHardEvalReport(runs, stats, answerable, before);
  return { runs, report, answerable };
}

export async function runPooledHybrid(
  corpus: BenchmarkCorpus,
  caps: RetrieveCandidateCaps,
): Promise<{ metrics: AggMetrics }> {
  const { runs } = await runCorpusAblation(corpus, {
    caps,
    configs: [{ name: "full hybrid", legs: {} }],
  });
  const full = aggregate(
    runs.find((run) => run.name === "full hybrid")?.outcomes ?? [],
  );
  return { metrics: full };
}

export function buildPooledComparisonReport(args: {
  label: string;
  memoryCount: number;
  queryCount: number;
  legacy: AggMetrics;
  widened: AggMetrics;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  return `# vmem Convex retrieve pool comparison — ${args.label}

Generated: ${today} · Corpus: ${String(args.memoryCount)} memories · Answerable queries: ${String(args.queryCount)} · Embeddings: ${embeddingMode()}

Production-like candidate generation (then the same hybrid ranker):

${mdTable(
  [
    "Pool",
    "recall@1",
    "recall@5",
    "recall@10",
    "MRR",
    "nDCG@10",
    "p50 ms",
    "p95 ms",
  ],
  [
    [
      "legacy last 200 ∪ 32 FTS ∪ 32 vectors",
      pct(args.legacy.recall1),
      pct(args.legacy.recall5),
      pct(args.legacy.recall10),
      args.legacy.mrr.toFixed(3),
      args.legacy.ndcg10.toFixed(3),
      args.legacy.latencyP50.toFixed(1),
      args.legacy.latencyP95.toFixed(1),
    ],
    [
      "index FTS 256 ∪ vector 256 ∪ 2-hop links (cap 384)",
      pct(args.widened.recall1),
      pct(args.widened.recall5),
      pct(args.widened.recall10),
      args.widened.mrr.toFixed(3),
      args.widened.ndcg10.toFixed(3),
      args.widened.latencyP50.toFixed(1),
      args.widened.latencyP95.toFixed(1),
    ],
  ],
)}

${mdTable(
  ["Metric", "Before (200∪32∪32)", "After (index pool)", "Δ"],
  [
    [
      "recall@5",
      pct(args.legacy.recall5),
      pct(args.widened.recall5),
      signedPct(args.widened.recall5 - args.legacy.recall5),
    ],
    [
      "MRR",
      args.legacy.mrr.toFixed(3),
      args.widened.mrr.toFixed(3),
      signedFixed(args.widened.mrr - args.legacy.mrr),
    ],
    [
      "nDCG@10",
      args.legacy.ndcg10.toFixed(3),
      args.widened.ndcg10.toFixed(3),
      signedFixed(args.widened.ndcg10 - args.legacy.ndcg10),
    ],
  ],
)}

Recency list is not the search universe. Convex-only. No Neo4j.
`;
}

export async function runPooledComparison(
  corpus: BenchmarkCorpus,
  label: string,
): Promise<{
  legacy: AggMetrics;
  widened: AggMetrics;
  report: string;
}> {
  const [legacyRun, widenedRun] = await Promise.all([
    runPooledHybrid(corpus, LEGACY_RETRIEVE_CAPS),
    runPooledHybrid(corpus, INDEX_RETRIEVE_CAPS),
  ]);
  const answerable = corpus.queries.filter((q) => q.expectedTitles.length > 0);
  const report = buildPooledComparisonReport({
    label,
    memoryCount: corpus.memories.length,
    queryCount: answerable.length,
    legacy: legacyRun.metrics,
    widened: widenedRun.metrics,
  });
  return {
    legacy: legacyRun.metrics,
    widened: widenedRun.metrics,
    report,
  };
}

export async function runTailGoldComparison(): Promise<{
  corpus: ReturnType<typeof generateTailCorpus>;
  legacy: AggMetrics;
  widened: AggMetrics;
  report: string;
}> {
  const corpus = generateTailCorpus();
  const comparison = await runPooledComparison(corpus, "tail gold");
  return { corpus, ...comparison };
}

const HYBRID_ONLY_EVAL_NAME = "hybrid-only (judge: off)";
const DEFAULT_JEV_EVAL_NAME = "default (Jev on)";

const JEV_GATE_EVAL_CONFIGS: LegConfig[] = [
  { name: HYBRID_ONLY_EVAL_NAME, legs: {}, judge: "off" },
  { name: DEFAULT_JEV_EVAL_NAME, legs: {} },
];

function goldDrops(
  hybrid: QueryOutcome[],
  gated: QueryOutcome[],
  answerable: RetrievalEvalQuery[],
): Array<{ query: string; type: string; missing: string[] }> {
  const out: Array<{ query: string; type: string; missing: string[] }> = [];
  const n = Math.min(hybrid.length, gated.length, answerable.length);
  for (let i = 0; i < n; i += 1) {
    const query = answerable[i];
    const before = hybrid[i];
    const after = gated[i];
    if (query === undefined || before === undefined || after === undefined) {
      continue;
    }
    const afterSet = new Set(after.titles);
    const missing = query.expectedTitles.filter(
      (title) => before.titles.includes(title) && !afterSet.has(title),
    );
    if (missing.length === 0) continue;
    out.push({ query: query.query, type: query.type, missing });
  }
  return out;
}

function buildJevGateReport(args: {
  hybrid: ConfigRun;
  gated: ConfigRun;
  stats: { memoryCount: number; tokens: number };
  answerable: RetrievalEvalQuery[];
  abstention: RetrievalEvalQuery[];
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const hybridAgg = aggregate(args.hybrid.outcomes);
  const gatedAgg = aggregate(args.gated.outcomes);
  const jev = args.gated.jev ?? emptyJevCallStats();
  const drops = goldDrops(
    args.hybrid.outcomes,
    args.gated.outcomes,
    args.answerable,
  );
  const failOpen = args.gated.outcomes.filter((row) => row.jevFailOpen).length;
  const emptyAnswerable = args.gated.outcomes.filter((row) => row.empty).length;
  const recallDrop = args.gated.outcomes.filter(
    (row, i) => row.recall5 < (args.hybrid.outcomes[i]?.recall5 ?? 0),
  ).length;
  const overallTable = mdTable(
    [
      "Config",
      "recall@1",
      "recall@3",
      "recall@5",
      "recall@10",
      "P@5",
      "MRR",
      "nDCG@10",
      "ctx tok",
      "p50 ms",
      "p95 ms",
    ],
    [
      [
        DEFAULT_JEV_EVAL_NAME,
        pct(gatedAgg.recall1),
        pct(gatedAgg.recall3),
        pct(gatedAgg.recall5),
        pct(gatedAgg.recall10),
        pct(gatedAgg.precision5),
        gatedAgg.mrr.toFixed(3),
        gatedAgg.ndcg10.toFixed(3),
        String(Math.round(gatedAgg.meanCtxTokens)),
        gatedAgg.latencyP50.toFixed(0),
        gatedAgg.latencyP95.toFixed(0),
      ],
      [
        HYBRID_ONLY_EVAL_NAME,
        pct(hybridAgg.recall1),
        pct(hybridAgg.recall3),
        pct(hybridAgg.recall5),
        pct(hybridAgg.recall10),
        pct(hybridAgg.precision5),
        hybridAgg.mrr.toFixed(3),
        hybridAgg.ndcg10.toFixed(3),
        String(Math.round(hybridAgg.meanCtxTokens)),
        hybridAgg.latencyP50.toFixed(0),
        hybridAgg.latencyP95.toFixed(0),
      ],
    ],
  );
  const deltaTable = mdTable(
    ["Metric", "hybrid-only", "default (Jev)", "Δ"],
    [
      [
        "recall@1",
        pct(hybridAgg.recall1),
        pct(gatedAgg.recall1),
        signedPct(gatedAgg.recall1 - hybridAgg.recall1),
      ],
      [
        "recall@5",
        pct(hybridAgg.recall5),
        pct(gatedAgg.recall5),
        signedPct(gatedAgg.recall5 - hybridAgg.recall5),
      ],
      [
        "recall@10",
        pct(hybridAgg.recall10),
        pct(gatedAgg.recall10),
        signedPct(gatedAgg.recall10 - hybridAgg.recall10),
      ],
      [
        "P@5",
        pct(hybridAgg.precision5),
        pct(gatedAgg.precision5),
        signedPct(gatedAgg.precision5 - hybridAgg.precision5),
      ],
      [
        "MRR",
        hybridAgg.mrr.toFixed(3),
        gatedAgg.mrr.toFixed(3),
        signedFixed(gatedAgg.mrr - hybridAgg.mrr),
      ],
      [
        "nDCG@10",
        hybridAgg.ndcg10.toFixed(3),
        gatedAgg.ndcg10.toFixed(3),
        signedFixed(gatedAgg.ndcg10 - hybridAgg.ndcg10),
      ],
    ],
  );
  const dropLines =
    drops.length === 0
      ? "None. Jev did not remove a gold title that hybrid had in the top 10."
      : mdTable(
          ["type", "query", "dropped gold"],
          drops
            .slice(0, 20)
            .map((row) => [row.type, row.query, row.missing.join("; ")]),
        );
  const neoKeep =
    gatedAgg.recall5 >= NEO4J_FULL_HYBRID.recall5
      ? "yes"
      : "no (below Neo4j 92.0% R@5 bar)";

  return `# vmem labelled retrieve: default (Jev on) vs hybrid-only

Generated: ${today} · Corpus: ${String(args.stats.memoryCount)} memories · Answerable: ${String(args.answerable.length)} · Abstention: ${String(args.abstention.length)} · Embeddings: ${embeddingMode()} · Jev: live System One \`jev-latest\` · Noul keep threshold: ${String(DEFAULT_JEV_RELEVANCE_THRESHOLD)}

Main result is **default (Jev on)** — the always-on retrieve path. Hybrid-only is the control (\`judge: "off"\`).

Re-run (needs \`TYPESAFE_API_KEY\`):

\`\`\`bash
EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev
\`\`\`

CI \`eval:bench\` / \`pnpm test\` stay hybrid-only. \`EVAL_JEV=1\` without a TypeSafe key fails closed (no mock numbers).

## Side-by-side

${overallTable}

${deltaTable}

Δ is default (Jev) minus hybrid-only.

## nDCG@10 by query type

${perTypeTable([args.gated, args.hybrid], args.answerable, (m) => m.ndcg10.toFixed(3))}

## Recall@5 by query type

${perTypeTable([args.gated, args.hybrid], args.answerable, (m) => pct(m.recall5))}

## Abstention (6 queries with no gold)

| Config | empty lists | top-score max | top-score mean |
| --- | --- | --- | --- |
| ${DEFAULT_JEV_EVAL_NAME} | ${String(args.gated.abstentionEmpty)} / ${String(args.abstention.length)} | ${Math.max(0, ...args.gated.abstentionTopScores).toFixed(3)} | ${mean(args.gated.abstentionTopScores).toFixed(3)} |
| ${HYBRID_ONLY_EVAL_NAME} | ${String(args.hybrid.abstentionEmpty)} / ${String(args.abstention.length)} | ${Math.max(0, ...args.hybrid.abstentionTopScores).toFixed(3)} | ${mean(args.hybrid.abstentionTopScores).toFixed(3)} |

## Jev gate diagnostics

| | |
| --- | --- |
| System One calls | ${String(jev.calls)} |
| Fail-open (HTTP/parse; hybrid kept) | ${String(jev.failures)} query errors, ${String(failOpen)} answerable lists with no \`jevRelevant\` |
| Hits dropped (noul < ${String(DEFAULT_JEV_RELEVANCE_THRESHOLD)}) | ${String(jev.dropped)} |
| Near-ties (noul in [0.45, 0.55], kept at 0.5) | ${String(jev.nearTies)} |
| Answerable queries emptied by the gate | ${String(emptyAnswerable)} |
| Answerable queries with recall@5 drop vs hybrid-only | ${String(recallDrop)} |
| Gold titles hybrid-only had in top 10 that Jev removed | ${String(drops.length)} |
| input_tokens (if API returned usage) | ${String(jev.inputTokens)} |
| output_tokens (if API returned usage) | ${String(jev.outputTokens)} |
| default (Jev) R@5 still ≥ Neo4j 92.0% | ${neoKeep} |

### Gold titles removed by Jev

${dropLines}

## Notes / caveats

- Same labelled harness as \`eval:bench\` (\`packages/backend/eval/*\`). Not the synthetic \`tests/memory/benchmark/retrieve.bench.test.ts\` toy.
- Product retrieve is default-on when \`TYPESAFE_API_KEY\` is set (PR #183). Eval disables with harness-only \`judge: "off"\`.
- Default-on over-fetches 20 hits, Jev judges that head, eval slices to k=10. Threshold **0.5** keeps near-ties; live smoke gold was 0.66 and traps 0.03.
- Jev is weak at date math — temporal windows still come from \`temporal.ts\`.
- Missing \`TYPESAFE_API_KEY\` on retrieve in prod fail-opens to hybrid. This labelled comparison **requires** a live key.
- Embeddings are synthetic unless \`OPENROUTER_API_KEY\` is set. Jev judges title/content, so the embedder only changes the hybrid head it sees.
- Token usage is whatever System One returned; dollar cost is not inferred.
`;
}

export async function runJevGateComparison(): Promise<{
  hybrid: ConfigRun;
  gated: ConfigRun;
  report: string;
  answerable: RetrievalEvalQuery[];
  abstention: RetrievalEvalQuery[];
}> {
  if (readSystemOneApiKey() === undefined) {
    throw new Error(EVAL_JEV_KEY_REQUIRED);
  }
  const corpus = generateBenchmarkCorpus();
  const { runs, answerable, abstention, stats } = await runCorpusAblation(
    corpus,
    {
      configs: JEV_GATE_EVAL_CONFIGS,
      jevDefaultOn: true,
      requireJevKey: true,
    },
  );
  const hybrid = runs.find((run) => run.name === HYBRID_ONLY_EVAL_NAME);
  const gated = runs.find((run) => run.name === DEFAULT_JEV_EVAL_NAME);
  if (hybrid === undefined || gated === undefined) {
    throw new Error(
      "jev gate comparison missing hybrid-only or default (Jev) run",
    );
  }
  const report = buildJevGateReport({
    hybrid,
    gated,
    stats,
    answerable,
    abstention,
  });
  return { hybrid, gated, report, answerable, abstention };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  Promise.all([
    runAblation(),
    runHardAblation(HARD_FULL_HYBRID_BEFORE),
    runPooledComparison(generateBenchmarkCorpus(), "labelled"),
    runPooledComparison(generateHardCorpus(), "hard"),
    runTailGoldComparison(),
  ])
    .then(([labelled, hard, labelledPool, hardPool, tail]) => {
      const labelledPath = fileURLToPath(
        new URL("./labelled-bench.md", import.meta.url),
      );
      const hardPath = fileURLToPath(
        new URL("./hard-bench.md", import.meta.url),
      );
      const poolPath = fileURLToPath(
        new URL(
          "../../../internal/bench/vmem-convex-pool-eval.md",
          import.meta.url,
        ),
      );
      mkdirSync(dirname(labelledPath), { recursive: true });
      writeFileSync(labelledPath, labelled.report, "utf8");
      writeFileSync(hardPath, hard.report, "utf8");
      writeFileSync(
        poolPath,
        [labelledPool.report, hardPool.report, tail.report].join("\n---\n\n"),
        "utf8",
      );
      console.log(labelled.report);
      console.log(hard.report);
      console.log(labelledPool.report);
      console.log(hardPool.report);
      console.log(tail.report);
      console.log(`\nwritten to ${labelledPath}`);
      console.log(`written to ${hardPath}`);
      console.log(`written to ${poolPath}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
