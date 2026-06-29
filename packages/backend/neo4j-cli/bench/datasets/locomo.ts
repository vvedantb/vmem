/**
 * LoCoMo dataset loader (snap-research `locomo10.json`).
 *
 * The raw file is a JSON array of "samples", each a multi-session
 * conversation between two named speakers plus a set of QA pairs. We parse
 * it with zod (the repo's validation tool — see `http/v1MemoriesClient.ts`)
 * so the rest of the harness works against typed, normalized structures and
 * never touches the raw dynamic-key shape.
 *
 * Dataset is NOT committed (license + size) — fetch it with
 * `pnpm bench:download` (see `datasets/download.ts`).
 *
 * Reference: https://github.com/snap-research/locomo
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** LoCoMo category integer → human label (mem0 memory-benchmarks mapping). */
export const LOCOMO_CATEGORY_LABELS: Record<number, string> = {
  1: "multi-hop",
  2: "temporal",
  3: "open-domain",
  4: "single-hop",
  5: "adversarial",
};

/** Category 5 is adversarial — excluded from scoring, matching mem0's methodology. */
export const ADVERSARIAL_CATEGORY = 5;

const turnSchema = z
  .object({
    speaker: z.string(),
    dia_id: z.string(),
    text: z.string(),
    blip_caption: z.string().optional(),
  })
  .passthrough();

// Conversation values are heterogeneous: session_<n> → turn[], everything
// else (speaker_a, speaker_b, session_<n>_date_time) → string. The union
// keeps the value typed without resorting to `unknown`.
const conversationSchema = z.record(z.union([z.string(), z.array(turnSchema)]));

const qaSchema = z
  .object({
    question: z.string(),
    // category 5 carries `adversarial_answer` instead of `answer`.
    answer: z.union([z.string(), z.number()]).optional(),
    adversarial_answer: z.string().optional(),
    evidence: z.array(z.string()).optional(),
    category: z.number(),
  })
  .passthrough();

const sampleSchema = z
  .object({
    sample_id: z.string().optional(),
    qa: z.array(qaSchema),
    conversation: conversationSchema,
  })
  .passthrough();

const datasetSchema = z.array(sampleSchema);

export interface LocomoTurn {
  speaker: string;
  diaId: string;
  text: string;
  blipCaption?: string;
}

export interface LocomoSession {
  /** "session_1", "session_2", … in chronological order. */
  key: string;
  /** Ordinal extracted from the key, used for ordering. */
  index: number;
  /** Raw timestamp string, e.g. "1:56 pm on 8 May, 2023". May be empty. */
  dateTime: string;
  turns: LocomoTurn[];
}

export interface LocomoQa {
  index: number;
  question: string;
  /** Gold answer, coerced to string (numeric answers happen). */
  answer: string;
  evidence: string[];
  category: number;
  categoryLabel: string;
  /** True for negative/abstention questions (LongMemEval `_abs`, BEAM abstention). */
  isAbstention: boolean;
}

export interface LocomoConversation {
  /** Stable id for namespacing (sample_id when present, else conv-<idx>). */
  id: string;
  speakerA: string;
  speakerB: string;
  sessions: LocomoSession[];
  /** QA pairs with the adversarial category already removed. */
  qa: LocomoQa[];
  /** Latest session timestamp — used as the answer prompt's reference date. */
  latestDateTime: string;
}

const SESSION_KEY = /^session_(\d+)$/;

function parseSessions(
  conversation: z.infer<typeof conversationSchema>,
): LocomoSession[] {
  const sessions: LocomoSession[] = [];
  for (const [key, value] of Object.entries(conversation)) {
    const match = SESSION_KEY.exec(key);
    if (!match || !Array.isArray(value)) continue;
    const index = Number(match[1]);
    const dateTimeValue = conversation[`${key}_date_time`];
    const dateTime = typeof dateTimeValue === "string" ? dateTimeValue : "";
    sessions.push({
      key,
      index,
      dateTime,
      turns: value.map((turn) => ({
        speaker: turn.speaker,
        diaId: turn.dia_id,
        text: turn.text,
        blipCaption: turn.blip_caption,
      })),
    });
  }
  return sessions.sort((a, b) => a.index - b.index);
}

function parseQa(qa: z.infer<typeof qaSchema>[]): LocomoQa[] {
  const result: LocomoQa[] = [];
  qa.forEach((item, index) => {
    if (item.category === ADVERSARIAL_CATEGORY) return;
    if (item.answer === undefined) return;
    result.push({
      index,
      question: item.question,
      answer: String(item.answer),
      evidence: item.evidence ?? [],
      category: item.category,
      categoryLabel: LOCOMO_CATEGORY_LABELS[item.category] ?? "unknown",
      isAbstention: false,
    });
  });
  return result;
}

export const DEFAULT_LOCOMO_PATH = fileURLToPath(
  new URL("./locomo10.json", import.meta.url),
);

export function locomoDatasetExists(
  path: string = DEFAULT_LOCOMO_PATH,
): boolean {
  return existsSync(path);
}

/**
 * Load and normalize the LoCoMo dataset. Throws a clear error (pointing at
 * the download script) when the file is missing.
 */
export function loadLocomo(
  path: string = DEFAULT_LOCOMO_PATH,
): LocomoConversation[] {
  if (!existsSync(path)) {
    throw new Error(
      `LoCoMo dataset not found at ${path}. Run \`pnpm bench:download\` first.`,
    );
  }
  const raw = readFileSync(path, "utf8");
  const samples = datasetSchema.parse(JSON.parse(raw));

  return samples.map((sample, idx) => {
    const sessions = parseSessions(sample.conversation);
    const speakerA = sample.conversation.speaker_a;
    const speakerB = sample.conversation.speaker_b;
    const latest = sessions.at(-1);
    return {
      id: sample.sample_id ?? `conv-${idx}`,
      speakerA: typeof speakerA === "string" ? speakerA : "Speaker A",
      speakerB: typeof speakerB === "string" ? speakerB : "Speaker B",
      sessions,
      qa: parseQa(sample.qa),
      latestDateTime: latest?.dateTime ?? "",
    };
  });
}
