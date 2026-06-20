/**
 * Aggregate a run's JSONL journal into a presentable markdown report at
 * `internal/bench/locomo-results.md` (and print the table to the console).
 *
 * Usage: pnpm bench:report --run-id run-123
 *        [--memory-model …] [--answer-model …] [--judge-model …]  # recorded in methodology
 *
 * The measured table is the headline: every provider row was graded by the
 * SAME answer + judge models, so the rows are directly comparable. Published
 * vendor numbers live in a SEPARATE, cited section because they use different
 * judges/answer models and are NOT comparable to the measured table.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeProviderMetrics, providersIn } from "./metrics";
import { qaRows, readRows, resultsPathFor } from "./results";

function arg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  return value ?? fallback;
}

const REPORT_PATH = fileURLToPath(
  new URL("../../../../internal/bench/locomo-results.md", import.meta.url),
);

const PUBLISHED_NUMBERS = `## Published vendor numbers (NOT comparable to the table above)

These are self-reported by each vendor under their own answer model + judge +
methodology. They are included for context only — different judges produce
different absolute scores, so they cannot be placed in the same table as the
measured rows. The whole point of the harness above is to compare under ONE judge.

| System | Benchmark | Reported | Source |
| --- | --- | --- | --- |
| Mem0 | LoCoMo | ~66% (J), SOTA claims vary by version | Mem0 paper, arXiv 2504.19413 |
| Mem0 Platform v3 | LongMemEval | 94.4% | github.com/mem0ai/memory-benchmarks |
| Supermemory | LongMemEval-S | 95% (Recall@15) | supermemory.ai/research/longmembench |
| ByteRover 2.0 | LoCoMo | 92.2% | byterover.dev/blog/benchmark-ai-agent-memory |
| Mastra | LongMemEval | 95% | mastra.ai/research/observational-memory |

LoCoMo and LongMemEval are different benchmarks; cross-benchmark comparison is
not meaningful either.`;

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function buildReport(
  runId: string,
  models: {
    memory: string;
    answer: string;
    judge: string;
  },
): string {
  const rows = qaRows(readRows(resultsPathFor(runId)));
  if (rows.length === 0) {
    throw new Error(`no graded rows in journal for run "${runId}"`);
  }
  const providers = providersIn(rows);
  const metrics = providers.map((p) => computeProviderMetrics(p, rows));

  const allCategories = Array.from(
    new Map(rows.map((r) => [r.category, r.categoryLabel] as const)).entries(),
  ).sort((a, b) => a[0] - b[0]);

  const header = [
    "Provider",
    "Overall J",
    ...allCategories.map(([, label]) => label),
    "Ctx tokens",
    "Search p50",
    "Search p95",
  ];
  const divider = header.map(() => "---");
  const bodyRows = metrics.map((m) => {
    const catCells = allCategories.map(([category]) => {
      const c = m.perCategory.find((x) => x.category === category);
      return c ? pct(c.accuracy) : "—";
    });
    return [
      m.provider,
      `**${pct(m.accuracy)}** (${String(m.correct)}/${String(m.total)})`,
      ...catCells,
      String(Math.round(m.meanContextTokens)),
      `${String(m.searchLatencyP50)}ms`,
      `${String(m.searchLatencyP95)}ms`,
    ];
  });

  const table = [header, divider, ...bodyRows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");

  const conversationCount = new Set(rows.map((r) => r.conversationId)).size;
  const judgeFailures = metrics.reduce((s, m) => s + m.judgeParseFailures, 0);
  const today = new Date().toISOString().slice(0, 10);

  return `# vmem LoCoMo benchmark results

Run id: \`${runId}\` · Generated: ${today} · Conversations: ${String(conversationCount)}

## Measured results (one judge, all rows comparable)

Headline metric is **LLM-judge accuracy (J)** — the fraction of questions the
judge marked correct. "Ctx tokens" is mean context fed to the answer model per
question (chars/4 approximation); lower is cheaper. Search latency is the
retrieval call only.

${table}

${judgeFailures > 0 ? `> ${String(judgeFailures)} judge response(s) failed to parse and were counted WRONG.\n\n` : ""}## Methodology

- **Benchmark:** LoCoMo (snap-research). Adversarial category 5 excluded, matching mem0's methodology.
- **Answer model:** \`${models.answer}\` · **Judge model:** \`${models.judge}\` · **vmem memory model:** \`${models.memory}\` (all via OpenRouter).
- **Answer + judge prompts:** adapted from \`mem0ai/memory-benchmarks\` (paraphrased, not verbatim — the upstream prompts are the methodology reference). The SAME prompts grade every provider, so absolute J depends on the judge but the ranking between systems does not.
- **Embeddings:** \`text-embedding-3-small\` (vmem's production model).
- **vmem path:** production engine code — bench extraction → per-fact hybrid retrieval → ADD/UPDATE/DELETE/NONE decision → engine create/update/delete with dedup → production enrichment (tags/entities/RELATES_TO). QA-time retrieval is the unmodified production \`retrieveMemories\` (RRF fusion, graph expansion, MMR).

### Deviations from production (vmem row)

- LLM calls via the CLI OpenRouter client, not Convex \`callJsonChat\` (same prompts/models).
- UPDATE/DELETE proposals auto-applied (no human review step).
- Bench-specific multi-speaker extraction prompt (production is single-user, first-person).
- No Convex scheduler — extraction → decision → enrichment run inline; session dates are baked into fact text because \`createMemory\` stamps \`createdAt = now\`.

### Caveats

- Latency reflects vmem on Neo4j Aura from a single CLI process; vendor latency figures come from their production infra and are not directly comparable.
- Context-token counts use a chars/4 approximation, consistent across providers.

${PUBLISHED_NUMBERS}
`;
}

function main(): void {
  const runId = arg("--run-id", "");
  if (!runId) throw new Error("--run-id is required");

  const report = buildReport(runId, {
    memory: arg("--memory-model", "openai/gpt-oss-20b:free"),
    answer: arg("--answer-model", "openai/gpt-oss-20b:free"),
    judge: arg("--judge-model", "openai/gpt-oss-120b:free"),
  });

  const dir = dirname(REPORT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(REPORT_PATH, report, "utf8");

  console.log(report);
  console.log(`\nwritten to ${REPORT_PATH}`);
}

main();
