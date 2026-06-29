/**
 * Download LongMemEval-S (cleaned) to datasets/longmemeval_s_cleaned.json.
 *
 * ~277 MB — gitignored. Idempotent.
 */

import { writeFileSync, existsSync } from "node:fs";
import { DEFAULT_LONGMEMEVAL_PATH } from "./longmemeval";

const LONGMEMEVAL_URL =
  "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json";

async function main(): Promise<void> {
  if (existsSync(DEFAULT_LONGMEMEVAL_PATH)) {
    console.log(`LongMemEval-S already present at ${DEFAULT_LONGMEMEVAL_PATH}`);
    return;
  }

  console.log(`downloading LongMemEval-S from ${LONGMEMEVAL_URL} ...`);
  const response = await fetch(LONGMEMEVAL_URL);
  if (!response.ok) {
    throw new Error(
      `download failed: ${String(response.status)} ${response.statusText}`,
    );
  }
  const text = await response.text();
  JSON.parse(text);
  writeFileSync(DEFAULT_LONGMEMEVAL_PATH, text, "utf8");
  console.log(
    `saved ${String(text.length)} bytes to ${DEFAULT_LONGMEMEVAL_PATH}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
