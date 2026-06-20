/**
 * Download the LoCoMo dataset to `datasets/locomo10.json` (gitignored).
 *
 * Run via `pnpm bench:download`. Idempotent — skips if the file already
 * exists. Source is the snap-research repo's raw JSON.
 */

import { writeFileSync, existsSync } from "node:fs";
import { DEFAULT_LOCOMO_PATH } from "./locomo";

const LOCOMO_RAW_URL =
  "https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json";

async function main(): Promise<void> {
  if (existsSync(DEFAULT_LOCOMO_PATH)) {
    console.log(`LoCoMo dataset already present at ${DEFAULT_LOCOMO_PATH}`);
    return;
  }

  console.log(`downloading LoCoMo from ${LOCOMO_RAW_URL} ...`);
  const response = await fetch(LOCOMO_RAW_URL);
  if (!response.ok) {
    throw new Error(
      `download failed: ${String(response.status)} ${response.statusText}`,
    );
  }
  const text = await response.text();

  // Validate it parses as JSON before writing — fail loud on an HTML error page.
  JSON.parse(text);

  writeFileSync(DEFAULT_LOCOMO_PATH, text, "utf8");
  console.log(`saved ${String(text.length)} bytes to ${DEFAULT_LOCOMO_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
