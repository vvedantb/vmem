import { jaccard, lessonKey, tokenize } from "./words.ts";

/**
 * Shape rules for a mined skill: a direct trigger description and
 * imperative, general steps. Pure and dependency-free; shared by Dream Mode
 * and the frontiermemory eval.
 */

export const MIN_SKILL_STEPS = 3;
export const MAX_SKILL_STEPS = 10;
const STEP_DUPLICATE_THRESHOLD = 0.6;

// uuids, long hex, temp paths, ISO times, long numbers: true for one run only.
export const RUN_SPECIFIC_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{10,}\b|\/tmp\/|\/var\/folders\/|\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|\b\d{6,}\b/i;
// Sizes, counts and precise values a skill step must not carry from one run.
const RUN_NUMBER_PATTERN =
  /\b\d+\.\d{3,}\b|\b\d[\d,.]*\s*(?:bytes?|[kmgt]i?b|rows?|lines?|records?|entries|items?|samples?|tokens?|files?|seconds?|ms|%)(?![a-z])/i;
// A step that opens with an article or pronoun is a statement, not a command.
const NOT_IMPERATIVE =
  /^(?:the|this|that|these|those|it|its|there|i|we|you|they|my|our|a|an|is|are|was|were)\b/i;

/** One imperative step that holds for any future run, else null. */
export function skillStep(text: string): string | null {
  const step = text
    .replace(/^\s*(?:step\s*\d+\s*[:.)-]?|\d+[.)])\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    step.length === 0 ||
    NOT_IMPERATIVE.test(step) ||
    RUN_SPECIFIC_PATTERN.test(step) ||
    RUN_NUMBER_PATTERN.test(step)
  ) {
    return null;
  }
  return step;
}

/** Valid steps in order, near-duplicates dropped, at most MAX_SKILL_STEPS. */
export function skillSteps(texts: readonly string[]): string[] {
  const steps: string[] = [];
  for (const text of texts) {
    const step = skillStep(text);
    if (step === null) continue;
    const key = lessonKey(step);
    if (
      steps.some(
        (kept) => jaccard(lessonKey(kept), key) >= STEP_DUPLICATE_THRESHOLD,
      )
    ) {
      continue;
    }
    steps.push(step);
  }
  return steps.slice(0, MAX_SKILL_STEPS);
}

const TRIGGER_PATTERN = /^use when a task (names|asks to)\s+(.+)$/i;
/** Near-miss openers the model writes, and the trigger verb they mean. */
const TRIGGER_REPAIRS: readonly [RegExp, "names" | "asks to"][] = [
  [
    /^use when (?:a |the )?(?:task|user|prompt|request)s?\s+(?:names?|mentions?|references?|is about|involves)\s+/i,
    "names",
  ],
  [
    /^use when (?:a |the )?(?:task|user|prompt|request)s?\s+(?:asks?|wants?|needs?|requires?|tells?)\s+(?:you\s+)?to\s+/i,
    "asks to",
  ],
  [
    /^use when (?:you\s+)?(?:need|want|are asked|have|must|are required)\s+to\s+/i,
    "asks to",
  ],
  [/^use when (?:asked|needing|required)\s+to\s+/i, "asks to"],
];
// Triggers that name no concrete task, product, file, tool or action.
const VAGUE_TRIGGER =
  /^(?:work(?:ing)?\s+on|deal(?:ing)?\s+with|help(?:ing)?\s+with|handl(?:e|ing)|do(?:ing)?|perform(?:ing)?|this|these|that|it|similar|related|any|something|(?:a|the|this)\s+(?:same\s+|similar\s+|current\s+|given\s+)?task)\b/i;

/**
 * A direct trigger ("Use when a task names X" / "Use when a task asks to
 * X"), repaired from a near miss. Null when vague or another shape.
 */
export function triggerDescription(description: string): string | null {
  const text = description
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "");
  let verb: "names" | "asks to" | null = null;
  let rest = "";
  const direct = TRIGGER_PATTERN.exec(text);
  if (direct) {
    verb = direct[1]?.toLowerCase() === "names" ? "names" : "asks to";
    rest = direct[2] ?? "";
  } else {
    for (const [pattern, repaired] of TRIGGER_REPAIRS) {
      if (!pattern.test(text)) continue;
      verb = repaired;
      rest = text.replace(pattern, "");
      break;
    }
  }
  if (
    verb === null ||
    VAGUE_TRIGGER.test(rest) ||
    tokenize(rest).length === 0
  ) {
    return null;
  }
  return `Use when a task ${verb} ${rest}`;
}
