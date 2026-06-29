/**
 * Download a BEAM split via the Hugging Face datasets-server rows API → local JSON.
 *
 * Avoids a parquet dependency. The API returns `probing_questions` as a Python
 * `repr` STRING (a dict keyed by ability); we parse it with `parsePythonLiteral`
 * and store the structured value. `chat` / `conversation_seed` come back as
 * native JSON. Only the fields the loader needs are kept — the large prose
 * columns (`narratives`, `conversation_plan`, `user_questions`, `user_profile`)
 * are dropped to shrink the file.
 *
 * Usage:
 *   pnpm bench:download:beam -- --split 100K
 *   pnpm bench:download:beam -- --split 100K --max-rows 5     # smoke
 *   pnpm bench:download:beam -- --split 100K --force          # overwrite
 */

import { writeFileSync, existsSync } from "node:fs";
import { z } from "zod";
import { beamDatasetPath } from "./beam";
import { parsePythonLiteral, type PyValue } from "./pythonLiteral";

const HF_ROWS =
  "https://datasets-server.huggingface.co/rows?dataset=Mohammadta/BEAM&config=default";

// Recursive JSON value — lets us validate the HF response without `any`/`as`.
const jsonValueSchema: z.ZodType<PyValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const hfResponseSchema = z.object({
  rows: z.array(z.object({ row: z.record(jsonValueSchema) })),
  num_rows_total: z.number(),
});

function getArg(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

interface BeamRowOut {
  conversation_id: PyValue;
  conversation_seed: PyValue;
  chat: PyValue;
  probing_questions: PyValue;
}

function normalizeProbingQuestions(raw: PyValue, convId: string): PyValue {
  if (typeof raw !== "string") {
    console.warn(
      `  [conv ${convId}] unexpected probing_questions type: ${typeof raw}`,
    );
    return {};
  }
  try {
    return parsePythonLiteral(raw);
  } catch (err) {
    console.warn(
      `  [conv ${convId}] probing_questions parse failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}

function normalizeRow(row: Record<string, PyValue>): BeamRowOut {
  const convId = String(row.conversation_id ?? "?");
  return {
    conversation_id: row.conversation_id ?? null,
    conversation_seed: row.conversation_seed ?? null,
    chat: row.chat ?? [],
    probing_questions: normalizeProbingQuestions(
      row.probing_questions ?? "",
      convId,
    ),
  };
}

async function fetchPage(
  split: string,
  offset: number,
  length: number,
): Promise<z.infer<typeof hfResponseSchema>> {
  const url = `${HF_ROWS}&split=${encodeURIComponent(split)}&offset=${String(offset)}&length=${String(length)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `HF rows API ${String(response.status)}: ${body.slice(0, 200)}`,
    );
  }
  return hfResponseSchema.parse(await response.json());
}

async function main(): Promise<void> {
  const split = getArg("--split") ?? "100K";
  const maxRowsRaw = getArg("--max-rows");
  const maxRows = maxRowsRaw ? Number(maxRowsRaw) : null;
  const outPath = beamDatasetPath(split);

  if (existsSync(outPath) && !process.argv.includes("--force")) {
    console.log(
      `BEAM ${split} already present at ${outPath} (use --force to overwrite)`,
    );
    return;
  }

  console.log(`fetching BEAM split ${split} via datasets-server ...`);
  const first = await fetchPage(split, 0, 1);
  const total = first.num_rows_total;
  const target = maxRows === null ? total : Math.min(maxRows, total);

  const conversations: BeamRowOut[] = [];
  const pageSize = 5;
  for (let offset = 0; offset < target; offset += pageSize) {
    const length = Math.min(pageSize, target - offset);
    const page = await fetchPage(split, offset, length);
    for (const entry of page.rows) {
      conversations.push(normalizeRow(entry.row));
    }
    console.log(
      `  ${String(conversations.length)}/${String(target)} conversations`,
    );
  }

  writeFileSync(outPath, JSON.stringify({ split, conversations }), "utf8");
  console.log(`saved ${String(conversations.length)} convs to ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
