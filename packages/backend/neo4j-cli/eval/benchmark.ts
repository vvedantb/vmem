/**
 * vmem internal retrieval benchmark — ablation runner.
 *
 * For each retrieval CONFIG (naive single-leg baselines → full hybrid) it runs
 * every labelled benchmark query through the PRODUCTION `retrieveMemories` (with
 * the config's per-leg toggles), and reports retrieval quality (recall@k,
 * precision, MRR, nDCG) overall AND by query type, token efficiency (retrieved
 * context vs the full corpus), latency (p50/p95), and an abstention signal
 * (top-1 score on no-answer queries vs answerable ones). Embeddings + Neo4j
 * only — no Claude, no judge.
 *
 * The labelled corpus comes from `eval/corpus.ts` (graded relevance + type
 * tags + deliberate distractors). `pnpm eval:bench` seeds `user_vmem_bench_eval`
 * only (no full-db wipe), runs this script, then removes that user's rows.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDriver, getDriver } from "../../engine/neo4j/driver";
import { deleteAllMemoriesForUser } from "../../engine/neo4j/memory/crud";
import { retrieveMemories } from "../../engine/neo4j/memory/retrieve";
import { embeddingMode, generateCliEmbedding } from "./cliEmbeddings";
import {
  mean,
  ndcgAtK,
  percentile,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "./metrics";
import type { RetrievalEvalQuery } from "./queries";
import { generateBenchmarkCorpus, BENCH_USER_ID } from "./corpus";

type Legs = NonNullable<Parameters<typeof retrieveMemories>[1]["legs"]>;

interface LegConfig {
  name: string;
  legs: Legs;
}

/** Naive single-leg baselines (mmr off = raw leg ranking) → full hybrid. */
const CONFIGS: LegConfig[] = [
  {
    name: "vector-only",
    legs: {
      vector: true,
      fulltext: false,
      chunk: false,
      entity: false,
      graph: false,
      dedup: false,
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
      dedup: false,
    },
  },
  { name: "hybrid (no graph)", legs: { graph: false } },
  { name: "hybrid (no dedup)", legs: { dedup: false } },
  { name: "full hybrid", legs: {} },
];

const K = 10;

/** Preferred ordering for the per-type tables; unknown types appended. */
const TYPE_ORDER = [
  "single-fact",
  "preference",
  "exact-match",
  "project",
  "lexical-trap",
  "update",
  "multi-hop",
];

const CORPUS = generateBenchmarkCorpus();
const ANSWERABLE = CORPUS.queries.filter((q) => q.expectedTitles.length > 0);
const ABSTENTION = CORPUS.queries.filter((q) => q.expectedTitles.length === 0);

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Graded relevance for a query: explicit grades if present, else binary (grade 1). */
function gradeMap(query: RetrievalEvalQuery): Map<string, number> {
  const map = new Map<string, number>();
  if (query.relevance) {
    for (const [title, grade] of Object.entries(query.relevance)) {
      map.set(title, grade);
    }
  }
  for (const title of query.expectedTitles) {
    if (!map.has(title)) map.set(title, 1);
  }
  return map;
}

interface QueryOutcome {
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

interface ConfigRun {
  name: string;
  outcomes: QueryOutcome[];
  abstentionTopScores: number[];
}

interface AggMetrics {
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

function aggregate(outcomes: QueryOutcome[]): AggMetrics {
  return {
    recall1: mean(outcomes.map((o) => o.recall1)),
    recall3: mean(outcomes.map((o) => o.recall3)),
    recall5: mean(outcomes.map((o) => o.recall5)),
    recall10: mean(outcomes.map((o) => o.recall10)),
    precision5: mean(outcomes.map((o) => o.precision5)),
    mrr: mean(outcomes.map((o) => o.rr)),
    ndcg10: mean(outcomes.map((o) => o.ndcg10)),
    meanCtxTokens: mean(outcomes.map((o) => o.ctxTokens)),
    latencyP50: percentile(
      outcomes.map((o) => o.latencyMs),
      50,
    ),
    latencyP95: percentile(
      outcomes.map((o) => o.latencyMs),
      95,
    ),
  };
}

async function fullCorpusTokens(
  driver: ReturnType<typeof getDriver>,
): Promise<{ tokens: number; memoryCount: number }> {
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (m:Memory {userId: $userId}) RETURN m.title AS title, m.content AS content`,
      { userId: BENCH_USER_ID },
    );
    let tokens = 0;
    for (const record of res.records) {
      tokens += approxTokens(
        `${String(record.get("title") ?? "")} ${String(record.get("content") ?? "")}`,
      );
    }
    return { tokens, memoryCount: res.records.length };
  } finally {
    await session.close();
  }
}

async function runConfig(
  driver: ReturnType<typeof getDriver>,
  config: LegConfig,
  embeddings: Map<string, number[]>,
): Promise<ConfigRun> {
  const outcomes: QueryOutcome[] = [];
  for (const query of ANSWERABLE) {
    const queryEmbedding = embeddings.get(query.query) ?? null;
    const start = performance.now();
    const candidates = await retrieveMemories(driver, {
      userId: BENCH_USER_ID,
      query: query.query,
      queryEmbedding,
      limit: K,
      legs: config.legs,
    });
    const latencyMs = performance.now() - start;
    const titles = candidates.map((c) => c.title);
    outcomes.push({
      type: benchQueryType(query),
      recall1: recallAtK(titles, query.expectedTitles, 1),
      recall3: recallAtK(titles, query.expectedTitles, 3),
      recall5: recallAtK(titles, query.expectedTitles, 5),
      recall10: recallAtK(titles, query.expectedTitles, 10),
      precision5: precisionAtK(titles, query.expectedTitles, 5),
      rr: reciprocalRank(titles, query.expectedTitles),
      ndcg10: ndcgAtK(titles, gradeMap(query), K),
      ctxTokens: candidates.reduce(
        (sum, c) => sum + approxTokens(`${c.title} ${c.content}`),
        0,
      ),
      latencyMs,
      topScore: candidates[0]?.trace.score ?? 0,
    });
  }

  const abstentionTopScores: number[] = [];
  for (const query of ABSTENTION) {
    const queryEmbedding = embeddings.get(query.query) ?? null;
    const candidates = await retrieveMemories(driver, {
      userId: BENCH_USER_ID,
      query: query.query,
      queryEmbedding,
      limit: K,
      legs: config.legs,
    });
    abstentionTopScores.push(candidates[0]?.trace.score ?? 0);
  }

  return { name: config.name, outcomes, abstentionTopScores };
}

const REPORT_PATH = fileURLToPath(
  new URL("../../../../internal/bench/vmem-internal-eval.md", import.meta.url),
);

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function mdTable(header: string[], rows: string[][]): string {
  return [header, header.map(() => "---"), ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

function benchQueryType(q: { type?: string }): string {
  return q.type ?? "untyped";
}

/** Sorted unique types present in the answerable set, preferred order first. */
function presentTypes(): string[] {
  const seen = new Set(ANSWERABLE.map((q) => benchQueryType(q)));
  const ordered = TYPE_ORDER.filter((t) => seen.has(t));
  const extra = [...seen].filter((t) => !TYPE_ORDER.includes(t)).sort();
  return [...ordered, ...extra];
}

/** Per-(config, type) metric matrix: rows = type, cols = config. */
function perTypeTable(
  runs: ConfigRun[],
  metric: (m: AggMetrics) => string,
): string {
  const types = presentTypes();
  const header = ["type", "n", ...runs.map((r) => r.name)];
  const rows = types.map((type) => {
    const n = ANSWERABLE.filter((q) => benchQueryType(q) === type).length;
    const cells = runs.map((r) =>
      metric(aggregate(r.outcomes.filter((o) => o.type === type))),
    );
    return [type, String(n), ...cells];
  });
  return mdTable(header, rows);
}

function buildReport(
  runs: ConfigRun[],
  corpus: { tokens: number; memoryCount: number },
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

  const ndcgByType = perTypeTable(runs, (m) => m.ndcg10.toFixed(3));
  const recallByType = perTypeTable(runs, (m) => pct(m.recall5));

  const abstentionTable = mdTable(
    ["Config", "answerable top-1 score", "abstention top-1 score"],
    runs.map((r) => [
      r.name,
      mean(r.outcomes.map((o) => o.topScore)).toFixed(3),
      mean(r.abstentionTopScores).toFixed(3),
    ]),
  );

  const hybrid = overall.find((r) => r.name === "full hybrid")?.agg;
  const efficiency =
    hybrid && hybrid.meanCtxTokens > 0
      ? (corpus.tokens / hybrid.meanCtxTokens).toFixed(0)
      : "n/a";

  return `# vmem internal retrieval benchmark

Generated: ${today} · Corpus: ${String(corpus.memoryCount)} memories · Answerable queries: ${String(ANSWERABLE.length)} · Abstention queries: ${String(ABSTENTION.length)} · Embeddings: ${embeddingMode()}

## Retrieval quality + ablation (production \`retrieveMemories\`, per-leg toggles)

${overallTable}

## nDCG@10 by query type

${ndcgByType}

## Recall@5 by query type

${recallByType}

## Token efficiency

Full corpus ≈ **${String(corpus.tokens)}** tokens. Full-hybrid retrieval feeds ≈ **${String(Math.round(hybrid?.meanCtxTokens ?? 0))}** tokens/query — about **${efficiency}× less** context than stuffing the whole corpus into the prompt.

## Abstention signal

Top-1 fused score on answerable vs no-answer queries. A lower abstention score means retrieval is less confident when nothing relevant exists (a threshold here is what the QA layer would use to abstain).

${abstentionTable}

## Notes

- Single-leg rows (\`vector-only\`, \`bm25-only\`) are naive baselines with dedup off — raw leg ranking. \`hybrid (no graph)\` isolates the graph contribution, \`hybrid (no dedup)\` the dedup contribution; \`full hybrid\` is the production path.
- Query types: **single-fact / preference** have one clear answer (embeddings handle these). **exact-match** is a distinctive code among near-identical lookalikes, query gives only the code — embeddings blur similar codes, so the BM25/fulltext leg lifts the hybrid above vector here. **project** is a related cluster whose sibling facts never repeat the anchor codename — tests associative recall via graph expansion. **lexical-trap** repeats the query keyword in a different sense (graded 0), penalising BM25. **update** has a stale + current memory, recency separates them. **multi-hop** puts the gold one RELATES_TO hop from a strong bridge, sharing only a faint word with the query.
- **Fusion was retuned after this benchmark exposed two flaws** (\`engine/neo4j/memory/retrieve.ts\`): before tuning full hybrid scored nDCG@10 ≈ 0.69 — below pure vector — because recency/confidence were a flat additive boost that swamped the tiny RRF relevance scores (retrieval effectively sorted by recency), and MMR's diversity penalty demoted genuinely-related cluster members. Fixes: per-leg RRF weights (favour vector, down-weight BM25), recency/confidence as a bounded relevance multiplier, and MMR replaced by near-duplicate-only suppression. The graph leg is net-positive post-tuning (largest gain on \`project\`).
- Pure retrieval metrics + latency — no LLM answer/judge. recall@k = fraction of labelled-relevant memories in top-k; nDCG@10 over graded relevance (binary where grades absent).
- Latency is single-process wall-clock against the eval Neo4j; not directly comparable to production infra.
`;
}

async function main(): Promise<void> {
  const driver = getDriver();
  try {
    console.log(`vmem internal benchmark · embeddings: ${embeddingMode()}`);

    // Embed each query once (answerable + abstention), reused across configs.
    const embeddings = new Map<string, number[]>();
    for (const query of CORPUS.queries) {
      embeddings.set(query.query, await generateCliEmbedding(query.query));
    }

    const corpus = await fullCorpusTokens(driver);
    if (corpus.memoryCount === 0) {
      throw new Error(
        `no memories for bench user ${BENCH_USER_ID} — run \`pnpm eval:bench\` (seeds first).`,
      );
    }

    const runs: ConfigRun[] = [];
    for (const config of CONFIGS) {
      runs.push(await runConfig(driver, config, embeddings));
    }

    const report = buildReport(runs, corpus);
    const dir = dirname(REPORT_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(REPORT_PATH, report, "utf8");
    console.log(report);
    console.log(`\nwritten to ${REPORT_PATH}`);
  } finally {
    try {
      const deleted = await deleteAllMemoriesForUser(driver, BENCH_USER_ID);
      console.log(
        `\nbench cleanup: removed ${String(deleted)} memories for ${BENCH_USER_ID}`,
      );
    } catch (cleanupError: unknown) {
      console.error(
        "bench cleanup failed:",
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError),
      );
    }
    await closeDriver();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
