import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RetrievalLegs } from "../engine/memory/rank";
import { generateBenchmarkCorpus, type RetrievalEvalQuery } from "./corpus";
import { embeddingMode, generateEvalEmbeddings } from "./embeddings";
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
  linksFromCorpus,
  retrieveEval,
  toEvalMemory,
} from "./retrieve";

interface LegConfig {
  name: string;
  legs: RetrievalLegs;
}

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
    },
  },
  {
    name: "hybrid (no graph)",
    legs: { graph: false },
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

  return `# vmem Convex retrieval eval

Generated: ${today} · Corpus: ${String(corpus.memoryCount)} memories · Answerable queries: ${String(answerable.length)} · Abstention queries: ${String(abstention.length)} · Embeddings: ${embeddingMode()}

## Retrieval quality + ablation (Convex ranker, per-leg toggles)

${overallTable}

## nDCG@10 by query type

${perTypeTable(runs, answerable, (m) => m.ndcg10.toFixed(3))}

## Recall@5 by query type

${perTypeTable(runs, answerable, (m) => pct(m.recall5))}

## Notes

- Legs: \`vector-only\` / \`bm25-only\` are naive single-channel baselines. \`hybrid (no graph)\` is lexical+vector+recency. \`full hybrid\` adds 1-hop stored memory links.
- Query types: **single-fact / preference** one clear answer. **exact-match** distinctive codes among lookalikes. **project** sibling facts that never repeat the codename. **lexical-trap** repeats a query keyword in a different sense (graded 0). **update** stale vs current, recency separates them. **multi-hop** gold is one stored link from a bridge that shares the query entity.
- Pure retrieval metrics + latency. No LLM judge. Neo4j is not used.
`;
}

export async function runAblation(): Promise<{
  runs: ConfigRun[];
  report: string;
  answerable: RetrievalEvalQuery[];
}> {
  const corpus = generateBenchmarkCorpus();
  const memories = corpus.memories.map(toEvalMemory);
  const links = linksFromCorpus(corpus);
  const answerable = corpus.queries.filter((q) => q.expectedTitles.length > 0);
  const abstention = corpus.queries.filter(
    (q) => q.expectedTitles.length === 0,
  );
  const uniqueQueries = [...new Set(corpus.queries.map((q) => q.query))];
  const memoryVectors = await generateEvalEmbeddings(
    memories.map((memory) => `${memory.title}\n\n${memory.content}`),
  );
  const queryVectors = await generateEvalEmbeddings(uniqueQueries);
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

  const nowMs = Date.now();
  const runs: ConfigRun[] = [];
  for (const config of EVAL_CONFIGS) {
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
  }

  const stats = {
    memoryCount: memories.length,
    tokens: memories.reduce(
      (sum, memory) => sum + approxTokens(`${memory.title} ${memory.content}`),
      0,
    ),
  };
  const report = buildEvalReport(runs, stats, answerable, abstention);
  return { runs, report, answerable };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runAblation()
    .then(({ report }) => {
      const reportPath = fileURLToPath(
        new URL("../../../internal/bench/vmem-convex-eval.md", import.meta.url),
      );
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, report, "utf8");
      console.log(report);
      console.log(`\nwritten to ${reportPath}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
