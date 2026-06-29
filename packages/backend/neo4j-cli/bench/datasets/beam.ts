/**
 * BEAM dataset loader (Mohammadta/BEAM on Hugging Face).
 *
 * The HF datasets-server serialises BEAM's `probing_questions` column as a
 * Python-`repr` STRING (a dict keyed by the 10 memory abilities), so
 * `downloadBeam.ts` parses that literal with `parsePythonLiteral` and stores the
 * structured value. This loader validates the saved shape and flattens it into
 * gradeable questions.
 *
 * Real row shape (per conversation):
 *   - `chat`: an array of SESSIONS, each session an array of turn objects
 *     (`{ role, content, time_anchor, … }`). The "100K" split packs ~3 sessions
 *     of ~60 turns each.
 *   - `probing_questions`: `{ <ability>: [ { question, <answer field>, … } ] }`.
 *     The gold-answer field varies by ability — abstention→`ideal_response`,
 *     contradiction_resolution→`ideal_answer`, summarization→`ideal_summary`,
 *     the rest→`answer`. `instruction_following` + `preference_following` are
 *     rubric/compliance-graded (no gold answer) and are EXCLUDED — see
 *     `RUBRIC_ABILITIES`. That leaves 8 of BEAM's 10 abilities gradeable by the
 *     shared gold-answer judge; the exclusion is logged on load.
 *
 * Fetch: `pnpm bench:download:beam -- --split 100K`
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Abilities graded by rubric/compliance (no gold answer) — excluded from QA. */
export const RUBRIC_ABILITIES = new Set<string>([
  "instruction_following",
  "preference_following",
]);

const turnSchema = z
  .object({
    role: z.string(),
    content: z.string(),
    // Only the first turn of a session carries an anchor; the rest are null.
    time_anchor: z.string().nullish(),
  })
  .passthrough();

const sessionSchema = z.array(turnSchema);

// Gold-answer field varies by ability; all candidates kept optional and picked
// in priority order by `answerOf`.
const probingItemSchema = z
  .object({
    question: z.string(),
    ideal_response: z.string().optional(),
    ideal_answer: z.string().optional(),
    answer: z.string().optional(),
    ideal_summary: z.string().optional(),
  })
  .passthrough();

const seedSchema = z
  .object({
    category: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

const conversationSchema = z
  .object({
    conversation_id: z.union([z.string(), z.number()]),
    conversation_seed: seedSchema.optional(),
    chat: z.array(sessionSchema),
    probing_questions: z.record(z.array(probingItemSchema)),
  })
  .passthrough();

const datasetSchema = z.object({
  split: z.string(),
  conversations: z.array(conversationSchema),
});

export interface BeamTurn {
  role: string;
  content: string;
  timeAnchor?: string;
}

export interface BeamSession {
  sessionId: string;
  dateTime: string;
  turns: BeamTurn[];
}

export interface BeamProbingQuestion {
  question: string;
  answer: string;
  questionType: string;
  isAbstention: boolean;
}

export interface BeamConversation {
  id: string;
  title: string;
  category: string;
  sessions: BeamSession[];
  questions: BeamProbingQuestion[];
}

export interface BeamDataset {
  split: string;
  conversations: BeamConversation[];
}

export function beamDatasetPath(split: string): string {
  const safe = split.replace(/[^0-9A-Za-z]/g, "");
  return fileURLToPath(new URL(`./beam_${safe}.json`, import.meta.url));
}

export function beamDatasetExists(split: string): boolean {
  return existsSync(beamDatasetPath(split));
}

// BEAM appends a turn-index marker to message content, e.g. " ->-> 1,1". Strip it.
const TURN_MARKER = /\s*->->\s*[\d,\s]+$/;

function stripMarker(content: string): string {
  return content.replace(TURN_MARKER, "").trim();
}

/** First non-empty gold-answer field, in priority order. Null when none (rubric items). */
function answerOf(item: z.infer<typeof probingItemSchema>): string | null {
  const candidates = [
    item.ideal_response,
    item.ideal_answer,
    item.answer,
    item.ideal_summary,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

function parseConversation(
  raw: z.infer<typeof conversationSchema>,
): BeamConversation {
  const id = String(raw.conversation_id);
  const seed = raw.conversation_seed;
  const title = seed?.title && seed.title.length > 0 ? seed.title : id;
  const category =
    seed?.category && seed.category.length > 0 ? seed.category : "unknown";

  const sessions: BeamSession[] = raw.chat.map((session, index) => {
    const turns: BeamTurn[] = session.map((turn) => ({
      role: turn.role,
      content: stripMarker(turn.content),
      timeAnchor: turn.time_anchor ?? undefined,
    }));
    const dateTime = turns.find((t) => t.timeAnchor)?.timeAnchor ?? "";
    return { sessionId: `session_${String(index + 1)}`, dateTime, turns };
  });

  const questions: BeamProbingQuestion[] = [];
  let droppedRubric = 0;
  let droppedNoAnswer = 0;
  for (const [ability, items] of Object.entries(raw.probing_questions)) {
    if (RUBRIC_ABILITIES.has(ability)) {
      droppedRubric += items.length;
      continue;
    }
    for (const item of items) {
      const answer = answerOf(item);
      if (answer === null) {
        droppedNoAnswer += 1;
        continue;
      }
      questions.push({
        question: item.question,
        answer,
        questionType: ability,
        isAbstention: ability === "abstention",
      });
    }
  }
  if (droppedRubric > 0 || droppedNoAnswer > 0) {
    console.warn(
      `  [beam ${id}] excluded ${String(droppedRubric)} rubric-graded + ${String(droppedNoAnswer)} no-answer question(s); kept ${String(questions.length)}`,
    );
  }

  return { id, title, category, sessions, questions };
}

export function loadBeam(split: string): BeamDataset {
  const path = beamDatasetPath(split);
  if (!existsSync(path)) {
    throw new Error(
      `BEAM dataset not found at ${path}. Run \`pnpm bench:download:beam -- --split ${split}\` first.`,
    );
  }
  const parsed = datasetSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  return {
    split: parsed.split,
    conversations: parsed.conversations.map(parseConversation),
  };
}
