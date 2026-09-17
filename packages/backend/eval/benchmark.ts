import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
  EVAL_K,
  autoLinksFromCorpus,
  linksFromCorpus,
  retrieveEval,
  toEvalMemory,
} from "./retrieve";
import type { MemoryLinkEdge } from "../engine/memory/links";

interface LegConfig {
  name: string;
  legs: RetrievalLegs;
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
}

export interface ConfigRun {
  name: string;
  outcomes: QueryOutcome[];
  abstentionTopScores: number[];
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

export async function runCorpusAblation(
  corpus: BenchmarkCorpus,
  options: {
    caps?: RetrieveCandidateCaps;
    configs?: LegConfig[];
    links?: readonly MemoryLinkEdge[];
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
    const outcomes: QueryOutcome[] = [];
    const abstentionTopScores: number[] = [];
    for (const query of corpus.queries) {
      const queryEmbedding = queryEmbeddings.get(query.query);
      if (queryEmbedding === undefined) {
        throw new Error(`missing embedding for ${query.query}`);
      }
      const started = performance.now();
      const candidates = retrieveEval(memories, query.query, {
        legs: config.legs,
        queryEmbedding,
        memoryEmbeddings,
        links,
        limit: EVAL_K,
        nowMs,
        filter: query.filter,
        caps: options.caps,
      });
      const latencyMs = performance.now() - started;
      if (query.expectedTitles.length === 0) {
        abstentionTopScores.push(candidates[0]?.trace.score ?? 0);
        continue;
      }
      const titles = candidates.map((c) => c.title);
      outcomes.push({
        type: query.type,
        recall1: recallAtK(titles, query.expectedTitles, 1),
        recall3: recallAtK(titles, query.expectedTitles, 3),
        recall5: recallAtK(titles, query.expectedTitles, 5),
        recall10: recallAtK(titles, query.expectedTitles, 10),
        precision5: precisionAtK(titles, query.expectedTitles, 5),
        rr: reciprocalRank(titles, query.expectedTitles),
        ndcg10: ndcgAtK(
          titles,
          new Map(Object.entries(query.relevance)),
          EVAL_K,
        ),
        ctxTokens: candidates.reduce(
          (sum, c) => sum + approxTokens(`${c.title} ${c.content}`),
          0,
        ),
        latencyMs,
        topScore: candidates[0]?.trace.score ?? 0,
      });
    }
    runs.push({ name: config.name, outcomes, abstentionTopScores });
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
