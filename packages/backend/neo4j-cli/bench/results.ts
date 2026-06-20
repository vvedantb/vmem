/**
 * Benchmark result journal (JSONL).
 *
 * Each run appends one line per graded question plus an "ingested" marker
 * per (provider, conversation). The append-only journal is the checkpoint:
 * `--resume` reads it back to skip already-ingested conversations and
 * already-graded questions, so a long run survives a crash or a call-cap abort.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const qaRowSchema = z.object({
  type: z.literal("qa"),
  runId: z.string(),
  provider: z.string(),
  conversationId: z.string(),
  qaIndex: z.number(),
  category: z.number(),
  categoryLabel: z.string(),
  question: z.string(),
  gold: z.string(),
  generated: z.string(),
  correct: z.boolean(),
  judgeParsed: z.boolean(),
  contextTokens: z.number(),
  searchLatencyMs: z.number(),
});

const ingestedRowSchema = z.object({
  type: z.literal("ingested"),
  provider: z.string(),
  conversationId: z.string(),
});

const rowSchema = z.discriminatedUnion("type", [
  qaRowSchema,
  ingestedRowSchema,
]);

export type QaResultRow = z.infer<typeof qaRowSchema>;
export type IngestedMarkerRow = z.infer<typeof ingestedRowSchema>;
export type ResultRow = z.infer<typeof rowSchema>;

export function resultsPathFor(runId: string): string {
  return fileURLToPath(new URL(`./results/${runId}.jsonl`, import.meta.url));
}

export function appendRow(path: string, row: ResultRow): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, "utf8");
}

/** Read all valid rows; silently skip malformed lines (partial last write). */
export function readRows(path: string): ResultRow[] {
  if (!existsSync(path)) return [];
  const rows: ResultRow[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    const parsed = rowSchema.safeParse(JSON.parse(line));
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

export function qaRows(rows: ResultRow[]): QaResultRow[] {
  return rows.filter((r): r is QaResultRow => r.type === "qa");
}

/** Set of "<provider>::<conversationId>" already fully ingested. */
export function ingestedKeys(rows: ResultRow[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.type === "ingested") keys.add(`${r.provider}::${r.conversationId}`);
  }
  return keys;
}

/** Set of "<provider>::<conversationId>::<qaIndex>" already graded. */
export function gradedKeys(rows: ResultRow[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.type === "qa") {
      keys.add(`${r.provider}::${r.conversationId}::${String(r.qaIndex)}`);
    }
  }
  return keys;
}
