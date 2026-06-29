/**
 * LongMemEval-S dataset loader (xiaowu0162/longmemeval-cleaned).
 *
 * Each item is self-contained: question + gold answer + haystack chat
 * sessions (user/assistant turns). Unlike LoCoMo, there is no shared
 * conversation across questions — ingest one haystack per question.
 *
 * Fetch: `pnpm bench:download:longmemeval`
 *
 * Paper: LongMemEval (ICLR 2025)
 * https://github.com/xiaowu0162/LongMemEval
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const turnSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    has_answer: z.boolean().optional(),
  })
  .passthrough();

const sessionSchema = z.array(turnSchema);

const itemSchema = z
  .object({
    question_id: z.string(),
    question_type: z.string(),
    question: z.string(),
    // ~32 of 500 items carry a numeric answer (counts/years); coerce like LoCoMo.
    answer: z.union([z.string(), z.number()]),
    question_date: z.string(),
    haystack_session_ids: z.array(z.string()),
    haystack_dates: z.array(z.string()),
    haystack_sessions: z.array(sessionSchema),
    answer_session_ids: z.array(z.string()).optional(),
  })
  .passthrough();

const datasetSchema = z.array(itemSchema);

export interface LongMemEvalTurn {
  role: "user" | "assistant";
  content: string;
  hasAnswer?: boolean;
}

export interface LongMemEvalSession {
  sessionId: string;
  date: string;
  turns: LongMemEvalTurn[];
}

export interface LongMemEvalItem {
  /** Stable id for namespacing ingest + results. */
  id: string;
  questionType: string;
  question: string;
  answer: string;
  questionDate: string;
  answerSessionIds: string[];
  sessions: LongMemEvalSession[];
  /** True when question_id ends with `_abs` (abstention). */
  isAbstention: boolean;
}

export const DEFAULT_LONGMEMEVAL_PATH = fileURLToPath(
  new URL("./longmemeval_s_cleaned.json", import.meta.url),
);

export function longMemEvalDatasetExists(
  path: string = DEFAULT_LONGMEMEVAL_PATH,
): boolean {
  return existsSync(path);
}

function parseItem(raw: z.infer<typeof itemSchema>): LongMemEvalItem {
  const sessions: LongMemEvalSession[] = [];
  for (let i = 0; i < raw.haystack_sessions.length; i++) {
    const sessionId = raw.haystack_session_ids[i] ?? `session-${String(i)}`;
    const date = raw.haystack_dates[i] ?? "";
    const turns = raw.haystack_sessions[i] ?? [];
    sessions.push({
      sessionId,
      date,
      turns: turns.map((t) => ({
        role: t.role,
        content: t.content,
        hasAnswer: t.has_answer,
      })),
    });
  }

  return {
    id: raw.question_id,
    questionType: raw.question_type,
    question: raw.question,
    answer: String(raw.answer),
    questionDate: raw.question_date,
    answerSessionIds: raw.answer_session_ids ?? [],
    sessions,
    isAbstention: raw.question_id.endsWith("_abs"),
  };
}

/**
 * Load LongMemEval-S. Abstention items are kept — callers may exclude them
 * from accuracy (vendor practice varies).
 */
export function loadLongMemEval(
  path: string = DEFAULT_LONGMEMEVAL_PATH,
): LongMemEvalItem[] {
  if (!existsSync(path)) {
    throw new Error(
      `LongMemEval dataset not found at ${path}. Run \`pnpm bench:download:longmemeval\` first.`,
    );
  }
  const raw = readFileSync(path, "utf8");
  const items = datasetSchema.parse(JSON.parse(raw));
  return items.map(parseItem);
}
