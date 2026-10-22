import type { MemoryStatus } from "@vmem/sdk";
import { z } from "zod";
import { truncateAtWord } from "../../llm/truncateAtWord";
import {
  evaluateSystemOne,
  SYSTEMONE_DEFAULT_MODEL,
  type EvaluateSystemOneArgs,
  type SystemOneQuestion,
  type SystemOneResponse,
} from "../../llm/systemOneClient";

// Jev duplicate judge for one candidate group (cleanup rule J): are these
// duplicates, which one to keep, which to remove, why. Typed answers only.

const CONTENT_CHARS = 500;
const CRITERIA_CHARS = 160;
const ERROR_CHARS = 200;
// below this the group is reported as not a duplicate
export const JEV_DUPLICATE_MIN = 0.7;
const JEV_REMOVE_MIN = 0.5;

export interface JevGroupMember {
  id: string;
  title: string;
  content: string;
  status: MemoryStatus;
  createdAt: number;
}

const REASONS = {
  same_page: "Same page or document saved more than once",
  same_fact: "Same fact stated in different words",
  stale_copy: "An older copy of the same information",
  different: "Different facts that only share words or a topic",
};

type ReasonKey = keyof typeof REASONS;

function isReasonKey(key: string): key is ReasonKey {
  return Object.hasOwn(REASONS, key);
}

function optionKey(index: number): string {
  return `m${String(index)}`;
}

function removeKey(index: number): string {
  return `remove_${optionKey(index)}`;
}

export function buildJevDuplicateQuestions(
  members: readonly JevGroupMember[],
): Record<string, SystemOneQuestion> {
  const keepCriteria: Record<string, string | null> = {};
  const questions: Record<string, SystemOneQuestion> = {
    duplicate: {
      type: "noul",
      instructions:
        "Do these memories hold the same information, so all but one can be removed with nothing lost?",
      criteria: {
        true: "Same fact, page or record; the copies add nothing new",
        false: "Different facts, projects, people or time windows",
      },
    },
  };
  members.forEach((member, i) => {
    keepCriteria[optionKey(i)] = `${member.title}: ${truncateAtWord(
      member.content,
      CRITERIA_CHARS,
    )}`;
    questions[removeKey(i)] = {
      type: "noul",
      instructions: `Can memory ${optionKey(i)} be removed because the kept memory already holds everything it says?`,
    };
  });
  questions.keep = {
    type: "choice",
    instructions: "Which memory is the most complete and current one to keep?",
    criteria: keepCriteria,
  };
  questions.reason = {
    type: "choice",
    instructions: "Why are these memories duplicates (or not)?",
    criteria: { ...REASONS },
  };
  return questions;
}

function buildState(members: readonly JevGroupMember[]) {
  return {
    task: "memory-duplicate-cleanup",
    memories: members.map((member, i) => ({
      key: optionKey(i),
      title: member.title,
      content: truncateAtWord(member.content, CONTENT_CHARS),
      createdAt: new Date(member.createdAt).toISOString(),
    })),
  };
}

const noulSchema = z.object({
  type: z.literal("noul"),
  noul: z.number().min(0).max(1),
});
const choiceSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
});
const verdictAnswersSchema = z.object({
  duplicate: noulSchema,
  keep: choiceSchema,
  reason: choiceSchema.optional(),
});

export type JevDuplicateVerdict =
  | {
      status: "flagged";
      keeperId: string;
      removeIds: string[];
      reason: string;
      confidence: number;
    }
  | { status: "not_duplicate"; reason: string; confidence: number }
  | { status: "error"; reason: string };

/**
 * Reads Jev's answers for one group. Malformed answers or a keeper outside
 * the group give "error"; remove answers for unknown keys are ignored; a
 * pinned row is never removed.
 */
export function parseJevDuplicateVerdict(
  members: readonly JevGroupMember[],
  answers: SystemOneResponse["answers"],
): JevDuplicateVerdict {
  const parsed = verdictAnswersSchema.safeParse(answers);
  if (!parsed.success) return { status: "error", reason: "malformed answers" };
  const { duplicate, keep, reason } = parsed.data;
  const keeperIndex = members.findIndex((_, i) => optionKey(i) === keep.choice);
  const keeper = members[keeperIndex];
  if (!keeper) return { status: "error", reason: "keeper not in group" };
  const reasonKey =
    reason !== undefined && isReasonKey(reason.choice)
      ? reason.choice
      : undefined;
  const reasonText = reasonKey === undefined ? "Duplicate" : REASONS[reasonKey];
  if (duplicate.noul < JEV_DUPLICATE_MIN || reasonKey === "different") {
    return {
      status: "not_duplicate",
      reason: reasonText,
      confidence: duplicate.noul,
    };
  }
  const removeIds = members
    .filter((member, i) => {
      if (i === keeperIndex || member.status === "pinned") return false;
      const answer = noulSchema.safeParse(answers[removeKey(i)]);
      return answer.success && answer.data.noul >= JEV_REMOVE_MIN;
    })
    .map((member) => member.id);
  if (removeIds.length === 0) {
    return {
      status: "not_duplicate",
      reason: "Nothing safe to remove",
      confidence: duplicate.noul,
    };
  }
  return {
    status: "flagged",
    keeperId: keeper.id,
    removeIds,
    reason: reasonText,
    confidence: duplicate.noul,
  };
}

export interface JevDuplicateResult {
  verdict: JevDuplicateVerdict;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
}

/** One Jev call for one group. Never throws: a failed call is "error". */
export async function judgeDuplicateGroup(args: {
  members: readonly JevGroupMember[];
  apiKey: string;
  evaluate?: (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse>;
}): Promise<JevDuplicateResult> {
  const evaluate = args.evaluate ?? evaluateSystemOne;
  try {
    const response = await evaluate({
      apiKey: args.apiKey,
      state: buildState(args.members),
      questions: buildJevDuplicateQuestions(args.members),
      tag: "dream-cleanup",
      // request-level ZDR is not on our gateway plan: 403 before routing
      dataPolicy: "no-training",
    });
    return {
      verdict: parseJevDuplicateVerdict(args.members, response.answers),
      model: response.model,
      promptTokens: response.usage?.input_tokens,
      completionTokens: response.usage?.output_tokens,
      costUsd: response.costUsd,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "jev failed";
    return {
      verdict: { status: "error", reason: message.slice(0, ERROR_CHARS) },
      model: SYSTEMONE_DEFAULT_MODEL,
    };
  }
}
