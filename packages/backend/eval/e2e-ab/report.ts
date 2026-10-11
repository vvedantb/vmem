import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArmSummary, FixtureSummary } from "./aggregate.ts";
import type { Trial } from "./types.ts";

export const DEFAULT_OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "results",
  "result.json",
);

export interface E2eAbResult {
  generatedAt: string;
  dryRun: boolean;
  repeats: number;
  agentModel: string | null;
  judgeModel: string;
  fixtures: string[];
  arms: { off: ArmSummary; on: ArmSummary };
  // on mean minus off mean, in score points (0-100). Null when not scored.
  delta: number | null;
  byFixture: FixtureSummary[];
  trials: Trial[];
}

function num(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

function armRow(summary: ArmSummary): string[] {
  const scored = summary.scored > 0;
  return [
    summary.arm,
    String(summary.trials),
    String(summary.scored),
    num(scored ? summary.meanScore : null),
    num(scored ? summary.stddev : null),
    scored ? `${summary.minScore}-${summary.maxScore}` : "—",
    num(scored ? summary.meanCostUsd : null, 4),
    num(scored ? summary.meanTokens : null, 0),
    num(scored ? summary.meanLatencyMs : null, 0),
    String(summary.contaminated),
    String(summary.judgeErrors),
    String(summary.agentErrors),
  ];
}

function renderTable(header: string[], rows: string[][]): string {
  const widths = header.map((cell, i) =>
    Math.max(cell.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const line = (cells: string[]): string =>
    `| ${cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(" | ")} |`;
  return [
    line(header),
    `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}

export function formatTable(result: E2eAbResult): string {
  const armTable = renderTable(
    [
      "arm",
      "trials",
      "scored",
      "mean score",
      "stddev",
      "min-max",
      "cost USD",
      "tokens (in+out)",
      "latency ms",
      "contaminated",
      "judge errors",
      "agent errors",
    ],
    [armRow(result.arms.off), armRow(result.arms.on)],
  );
  const fixtureTable = renderTable(
    ["fixture", "off mean", "on mean", "delta"],
    result.byFixture.map((row) => [
      row.fixtureId,
      num(row.offMean),
      num(row.onMean),
      num(row.delta),
    ]),
  );
  return [
    `vmem e2e A/B eval (${result.dryRun ? "DRY RUN, no scores" : "live"})`,
    `fixtures: ${result.fixtures.length}, repeats per arm: ${result.repeats}, agent model: ${result.agentModel ?? "default"}, judge model: ${result.judgeModel}`,
    "Scores are 0-100. Cost is USD per trial. Tokens are input + output per trial.",
    "",
    armTable,
    "",
    fixtureTable,
    "",
    `delta (on mean - off mean): ${num(result.delta)} points`,
  ].join("\n");
}

export function writeResult(result: E2eAbResult, outPath: string): void {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
}
