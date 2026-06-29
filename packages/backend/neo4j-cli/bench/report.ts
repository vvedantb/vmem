/**
 * Aggregate a run's JSONL journal into a presentable markdown report at
 * `internal/bench/<benchmark>-results.md` (and print the table to the console).
 *
 * Usage: pnpm bench:report -- --run-id run-123 --benchmark beam \
 *          [--answer-model claude:sonnet] [--judge-model openai/gpt-4o-mini] [--seed 123]
 *
 * The measured table is the headline: every provider row was graded by the SAME
 * reader + judge, so the rows are directly comparable to each other. Published
 * vendor numbers live in a SEPARATE, cited section because they use a different
 * reader/judge and are NOT comparable to the measured table.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeProviderMetrics, providersIn } from "./metrics";
import { qaRows, readRows, resultsPathFor, type QaResultRow } from "./results";

function arg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  return value ?? fallback;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

function reportPathFor(benchmark: string): string {
  return fileURLToPath(
    new URL(
      `../../../../internal/bench/${benchmark}-results.md`,
      import.meta.url,
    ),
  );
}

interface BenchmarkMeta {
  title: string;
  datasetNote: string;
}

const BENCHMARK_META: Record<string, BenchmarkMeta> = {
  locomo: {
    title: "LoCoMo",
    datasetNote:
      "LoCoMo (snap-research). Adversarial category 5 excluded, matching mem0's methodology.",
  },
  longmemeval: {
    title: "LongMemEval-S",
    datasetNote:
      "LongMemEval-S (xiaowu0162/longmemeval-cleaned, ICLR 2025). A stratified, indicative slice — not the full 500-question benchmark.",
  },
  beam: {
    title: "BEAM 100K",
    datasetNote:
      "BEAM (Mohammadta/BEAM, 100K split). 8 of 10 abilities are gold-answer graded; instruction_following + preference_following are rubric-graded and excluded.",
  },
};

const VENDOR_TABLE = `| System | Benchmark | Reported | Source |
| --- | --- | --- | --- |
| Mem0 | LoCoMo | ~66% (J) | Mem0 paper, arXiv 2504.19413 |
| Mem0 Platform v3 | LongMemEval | 94.4% | github.com/mem0ai/memory-benchmarks |
| Supermemory | LongMemEval-S | 95% (Recall@15) | supermemory.ai/research/longmembench |
| ByteRover 2.0 | LoCoMo | 92.2% | byterover.dev/blog/benchmark-ai-agent-memory |`;

/**
 * Vendor leaderboard numbers. The comparability sentence is model-parameterized
 * (not hardcoded to Claude/gpt-4o-mini) and only draws the explicit
 * vendor-comparison in vendor-format runs; a plain run keeps a generic caveat.
 */
function publishedNumbers(
  vendorFormat: boolean,
  answerModel: string,
  judgeModel: string,
): string {
  const intro = vendorFormat
    ? `These are self-reported by each vendor under their OWN reader + judge + methodology. Our numbers use a \`${answerModel}\` reader and a \`${judgeModel}\` judge (the vendors use a gpt-4o-mini reader + gpt-4o judge), so absolute scores are **directionally comparable, not strict apples-to-apples**.`
    : `These are self-reported by each vendor under their OWN reader + judge + methodology. They are included for context only — different readers/judges produce different absolute scores, so they cannot sit in the same table as the measured rows above.`;
  return `## Published vendor numbers (NOT comparable to the table above)

${intro}

${VENDOR_TABLE}

LoCoMo, LongMemEval, and BEAM are different benchmarks; cross-benchmark comparison is not meaningful either.`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Distinct (category, label) pairs over ANSWERABLE rows only, sorted by category. */
function answerableCategories(rows: QaResultRow[]): Array<[number, string]> {
  const pairs: Array<[number, string]> = [];
  for (const r of rows) {
    if (!r.isAbstention) pairs.push([r.category, r.categoryLabel]);
  }
  return Array.from(new Map(pairs).entries()).sort((a, b) => a[0] - b[0]);
}

function buildBanner(
  benchmark: string,
  answerModel: string,
  judgeModel: string,
  conversationCount: number,
  seed: string,
): string {
  const slice =
    benchmark === "longmemeval"
      ? ` **Stratified slice (N=${String(conversationCount)} items${seed ? `, seed=${seed}` : ""}), indicative — NOT the full 500-question benchmark.**`
      : "";
  return `> ⚠️ **DIRECTIONALLY COMPARABLE ONLY.** Reader = \`${answerModel}\`, judge = \`${judgeModel}\` — not the vendors' gpt-4o-mini reader + gpt-4o judge, so these numbers do **not** claim strict leaderboard parity with Mem0 / Supermemory.${slice}`;
}

function buildReport(
  runId: string,
  benchmark: string,
  models: { memory: string; answer: string; judge: string },
  seed: string,
  vendorFormat: boolean,
): string {
  const rows = qaRows(readRows(resultsPathFor(runId)));
  if (rows.length === 0) {
    throw new Error(`no graded rows in journal for run "${runId}"`);
  }
  const meta = BENCHMARK_META[benchmark] ?? {
    title: benchmark,
    datasetNote: benchmark,
  };
  const providers = providersIn(rows);
  const metrics = providers.map((p) => computeProviderMetrics(p, rows));
  const allCategories = answerableCategories(rows);

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

  // vmem as a fraction of the full-context oracle.
  const vmem = metrics.find((m) => m.provider === "vmem");
  const oracle = metrics.find((m) => m.provider === "full-context");
  const oracleLine =
    vmem && oracle && oracle.accuracy > 0
      ? `\n**vmem = ${pct(vmem.accuracy / oracle.accuracy)} of the full-context oracle.**\n`
      : "";

  // Abstention subset (graded by the abstention-aware judge).
  const hasAbstention = metrics.some((m) => m.abstention.total > 0);
  const abstentionSection = hasAbstention
    ? `\n## Abstention (abstention-aware judge — correct ⇔ the model declines)\n\n| Provider | Abstention accuracy | Correct |\n| --- | --- | --- |\n${metrics
        .filter((m) => m.abstention.total > 0)
        .map(
          (m) =>
            `| ${m.provider} | **${pct(m.abstention.accuracy)}** | ${String(m.abstention.correct)} / ${String(m.abstention.total)} |`,
        )
        .join("\n")}\n`
    : "";

  const conversationCount = new Set(rows.map((r) => r.conversationId)).size;
  const judgeFailures = metrics.reduce((s, m) => s + m.judgeParseFailures, 0);
  const skippedTotal = metrics.reduce((s, m) => s + m.skipped, 0);
  const today = new Date().toISOString().slice(0, 10);
  // Vendor-comparison banner only in vendor-format runs (default on for
  // beam/longmemeval, off for a plain locomo run — see main()).
  const banner = vendorFormat
    ? `${buildBanner(benchmark, models.answer, models.judge, conversationCount, seed)}\n\n`
    : "";

  return `# vmem ${meta.title} benchmark results

${banner}Run id: \`${runId}\` · Generated: ${today} · Conversations: ${String(conversationCount)}

## Measured results (one judge, all rows comparable)

Headline metric is **LLM-judge accuracy (J)** over ANSWERABLE questions — the
fraction the judge marked correct. "Ctx tokens" is mean context fed to the reader
per question (chars/4 approximation); lower is cheaper. Search latency is the
retrieval call only.

${table}
${oracleLine}${abstentionSection}
${judgeFailures > 0 ? `> ${String(judgeFailures)} judge response(s) failed to parse and were counted WRONG.\n\n` : ""}${skippedTotal > 0 ? `> ${String(skippedTotal)} arm(s) skipped — answer prompt exceeded the context budget (~180k tokens) — and excluded from accuracy.\n\n` : ""}## Methodology

- **Benchmark:** ${meta.datasetNote}
- **Protocol (vendor-style):** controlled \`retrieveMemories\` top-k → reader answers → fixed judge. Reader = \`${models.answer}\`, judge = \`${models.judge}\`, vmem ingest model = \`${models.memory}\`.
- **Arms:** \`vmem\` (production retrieval) and \`full-context\` (oracle ceiling). No no-memory arm (vendors do not use one).
- **vmem path:** production engine — bench extraction → per-fact hybrid retrieval → ADD/UPDATE/DELETE/NONE decision → engine create/update/delete with dedup → enrichment (tags/entities/RELATES_TO). QA-time retrieval is the unmodified production \`retrieveMemories\`.
- **Isolation:** each conversation ingests under its own synthetic \`userId\`, so retrieval cannot leak across items.
- **Comparability:** absolute J is **not** comparable to the official leaderboard — different judge (binary LLM-judge vs the vendors' gpt-4o / F1), reader, and (for LongMemEval) only a slice. The within-run ranking (vmem vs oracle) is the measured result.

${publishedNumbers(vendorFormat, models.answer, models.judge)}
`;
}

function main(): void {
  const runId = arg("--run-id", "");
  if (!runId) throw new Error("--run-id is required");
  const benchmark = arg("--benchmark", "locomo");

  // Vendor-comparison framing (banner + comparability caveat): on by default for
  // the vendor-format benchmarks, off for a plain locomo run. Override either way
  // with --vendor-format / --no-vendor-format.
  const vendorFormat = has("--vendor-format")
    ? true
    : has("--no-vendor-format")
      ? false
      : benchmark !== "locomo";

  const report = buildReport(
    runId,
    benchmark,
    {
      memory: arg("--memory-model", "openai/gpt-oss-20b:free"),
      answer: arg("--answer-model", "openai/gpt-oss-20b:free"),
      judge: arg("--judge-model", "openai/gpt-oss-120b:free"),
    },
    arg("--seed", ""),
    vendorFormat,
  );

  const reportPath = reportPathFor(benchmark);
  const dir = dirname(reportPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(reportPath, report, "utf8");

  console.log(report);
  console.log(`\nwritten to ${reportPath}`);
}

main();
