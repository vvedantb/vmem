/**
 * Build the shared LoCoMo judge prompt (stdout). Used by claude-locomo-bench.ps1.
 *
 * Usage:
 *   pnpm exec tsx neo4j-cli/bench/exportJudgePrompt.ts -- --file judge-input.json
 *
 * judge-input.json: { "question": "...", "gold": "...", "generated": "..." }
 */

import { readFileSync } from "node:fs";
import { buildJudgePrompt } from "./qa/judgePrompt";

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const filePath = arg("--file");
if (!filePath) {
  console.error("usage: exportJudgePrompt.ts --file <json>");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(filePath, "utf8")) as {
  question: string;
  gold: string;
  generated: string;
};

const prompt = buildJudgePrompt(
  payload.question,
  payload.gold,
  payload.generated,
);

process.stdout.write(prompt);
