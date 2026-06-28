/**
 * Parse a judge model response with the shared LoCoMo parser (stdout JSON).
 *
 * Usage:
 *   pnpm exec tsx neo4j-cli/bench/parseJudgeVerdict.ts -- --file judge-raw.txt
 */

import { readFileSync } from "node:fs";
import { parseJudgeResponse } from "./qa/judgePrompt";

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const filePath = arg("--file");
if (!filePath) {
  console.error("usage: parseJudgeVerdict.ts --file <raw response text>");
  process.exit(1);
}

const raw = readFileSync(filePath, "utf8");
const verdict = parseJudgeResponse(raw);

process.stdout.write(
  JSON.stringify(
    verdict ?? { correct: false, reasoning: "judge parse failed" },
  ),
);
