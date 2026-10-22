import { z } from "zod";
import { parseJsonString } from "../../llm/extractJsonString";
import { truncateAtWord } from "../../llm/truncateAtWord";
import type { MemoryOutcome } from "./outcome";

// Qwen judge for one maybe-conflict pair (nightly dreaming step 4): same
// fact, newer version, contradiction, or unrelated. Pure: the caller makes
// the call (feature "dream", thinking off) and passes the reply here.

const CONTENT_CHARS = 600;
const REASON_CHARS = 300;

export const DREAM_JUDGE_ROLE =
  "You compare two saved memories of one user and say how they relate.";

export const DREAM_RELATIONS = [
  "duplicate",
  "update",
  "contradiction",
  "unrelated",
] as const;

export type DreamRelation = (typeof DREAM_RELATIONS)[number];

export interface DreamJudgeMemory {
  id: string;
  title: string;
  content: string;
  source: string;
  createdAt: number;
  // see outcome.ts; null or absent: the memory says nothing about an outcome
  outcome?: MemoryOutcome | null;
}

export type DreamJudgePair = readonly [DreamJudgeMemory, DreamJudgeMemory];

// the prompt names the memories m0 / m1, never by their row ids
function keyOf(index: number): string {
  return `m${String(index)}`;
}

// only when a memory carries an outcome; without one the prompt is unchanged
const OUTCOME_RULES = [
  'outcome: whether the approach a memory records "worked" or "failed" ("mixed": both, "unknown": it does not say).',
  'Prefer what worked. A memory whose approach failed never replaces one that worked: pick "unrelated" so the failure stays as a pitfall, unless the newer memory says that the same approach stopped working (then it is an update).',
];

export function buildDreamJudgePrompt(pair: DreamJudgePair): string {
  const withOutcome = pair.some((memory) => (memory.outcome ?? null) !== null);
  const memories = pair.map((memory, i) => ({
    id: keyOf(i),
    title: memory.title,
    content: truncateAtWord(memory.content, CONTENT_CHARS),
    source: memory.source,
    createdAt: new Date(memory.createdAt).toISOString(),
    ...(withOutcome ? { outcome: memory.outcome ?? "unknown" } : {}),
  }));
  return [
    "Decide how memory m0 and memory m1 relate. Pick one relation:",
    '- "duplicate": the same fact; one can be removed with nothing lost.',
    '- "update": the same subject, and the newer memory replaces the older one (a changed value, status or decision).',
    '- "contradiction": the same subject, and the memories disagree with no clear newer truth.',
    '- "unrelated": anything else.',
    "Memories about different projects, products, repositories, people or time windows are unrelated, even when their wording is almost the same.",
    ...(withOutcome ? OUTCOME_RULES : []),
    "keeperId: the id (m0 or m1) of the memory to keep: the complete one for a duplicate, the newer one for an update. Use null for unrelated.",
    "confidence: 0 to 1. reason: one short sentence.",
    'Reply as JSON: {"relation": "...", "keeperId": "m0" | "m1" | null, "confidence": 0.0, "reason": "..."}',
    "",
    JSON.stringify({ memories }, null, 2),
  ].join("\n");
}

const replySchema = z.object({
  relation: z.enum(DREAM_RELATIONS),
  keeperId: z.string().nullish(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});

export type DreamJudgeVerdict =
  | { status: "unrelated"; confidence: number; reason: string }
  | {
      status: "related";
      relation: Exclude<DreamRelation, "unrelated">;
      keeperId: string;
      otherId: string;
      confidence: number;
      reason: string;
    }
  | { status: "error"; reason: string };

/**
 * Reads the judge reply. Malformed JSON, an unknown relation or a keeper
 * outside the pair (for anything but "unrelated") give "error".
 */
export function parseDreamJudgeReply(
  pair: DreamJudgePair,
  content: string | null,
): DreamJudgeVerdict {
  if (content === null) return { status: "error", reason: "empty reply" };
  const reply = parseJsonString(content, replySchema);
  if (reply === null) return { status: "error", reason: "malformed reply" };
  const given = reply.reason?.trim() ?? "";
  const reason = truncateAtWord(
    given.length > 0 ? given : reply.relation,
    REASON_CHARS,
  );
  if (reply.relation === "unrelated") {
    return { status: "unrelated", confidence: reply.confidence, reason };
  }
  const keeperIndex = pair.findIndex((_, i) => keyOf(i) === reply.keeperId);
  const keeper = pair[keeperIndex];
  const other = pair[1 - keeperIndex];
  if (keeper === undefined || other === undefined) {
    return { status: "error", reason: "keeper not in pair" };
  }
  return {
    status: "related",
    relation: reply.relation,
    keeperId: keeper.id,
    otherId: other.id,
    confidence: reply.confidence,
    reason,
  };
}
