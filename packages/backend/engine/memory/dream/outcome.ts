// outcome signal of a saved memory: did the approach it records work or
// fail? Read from tags first, then from the text. Null means no signal, and
// dreaming then behaves as it did before outcomes were read.

export type MemoryOutcome = "worked" | "failed" | "mixed";

// tag values, after an optional "outcome:" / "status:" / "result:" prefix
const WORKED_TAGS = new Set([
  "pass",
  "passed",
  "success",
  "succeeded",
  "worked",
  "fixed",
  "resolved",
]);
const FAILED_TAGS = new Set([
  "fail",
  "failed",
  "failure",
  "broken",
  "error",
  "reverted",
  "regression",
]);

// verifier verdicts only in capitals: "pass the flag" is not one
const WORKED_VERDICT = /\bPASS(?:ED)?\b/;
const FAILED_VERDICT = /\bFAIL(?:ED)?\b/;
// "worked on X" is about effort, not an outcome
const WORKED_PHRASE =
  /\bworked\b(?!\s+(?:on|with|at|for|through|in)\b)|\b(?:works now|succeeded|fixed it|resolved it|tests? (?:now )?pass(?:ed|es)?)\b/i;
const FAILED_PHRASE =
  /\b(?:failed|did ?n[o']t work|does ?n[o']t work|reverted|rolled back|traceback|errored)\b|\berror:/i;

function tagValue(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/^(?:outcome|status|result)[:=/]/, "");
}

function combine(worked: boolean, failed: boolean): MemoryOutcome | null {
  if (worked && failed) return "mixed";
  if (worked) return "worked";
  return failed ? "failed" : null;
}

export function memoryOutcome(memory: {
  title: string;
  content: string;
  tags: readonly string[];
}): MemoryOutcome | null {
  const values = memory.tags.map(tagValue);
  const byTag = combine(
    values.some((value) => WORKED_TAGS.has(value)),
    values.some((value) => FAILED_TAGS.has(value)),
  );
  if (byTag !== null) return byTag;
  const text = `${memory.title}\n${memory.content}`;
  return combine(
    WORKED_VERDICT.test(text) || WORKED_PHRASE.test(text),
    FAILED_VERDICT.test(text) || FAILED_PHRASE.test(text),
  );
}
