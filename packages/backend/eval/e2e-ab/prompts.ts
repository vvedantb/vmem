import type { Fixture } from "./fixture.ts";

// Same prompt for both arms. It names no memory tool, so neither arm is hinted.
export function buildTaskPrompt(fixture: Fixture): string {
  return [
    "Answer the question below. Use any tools you have that help you find the answer.",
    "If you cannot find the information, say so plainly. Do not guess or invent details.",
    "",
    "Question:",
    fixture.task.trim(),
    "",
    "End your reply with one block that starts with `ANSWER:` on its own line.",
    "Put the full final answer, in plain text, after it. Write nothing after the block.",
  ].join("\n");
}

const ANSWER_MARKER = /^[ \t>*_#-]*ANSWER:\**[ \t]*/gm;

// The last ANSWER: block wins over any preamble. Null when there is none.
export function extractAnswer(text: string): string | null {
  let start = -1;
  for (const match of text.matchAll(ANSWER_MARKER)) {
    start = match.index + match[0].length;
  }
  if (start === -1) return null;
  const answer = text.slice(start).trim();
  return answer === "" ? null : answer;
}

export function buildJudgePrompt(fixture: Fixture, answer: string): string {
  const list = (items: readonly string[]): string =>
    items.length === 0 ? "(none)" : items.map((item) => `- ${item}`).join("\n");
  return [
    "You grade one answer to a memory-recall question. Grade only the answer text below.",
    "You have no tools. Do not grade how the answer was found.",
    "",
    "Question:",
    fixture.task.trim(),
    "",
    "Acceptance criteria:",
    fixture.acceptanceCriteria.trim(),
    "",
    "Expected facts:",
    list(fixture.expectedFacts),
    "",
    "Facts the answer must NOT claim:",
    list(fixture.forbiddenFacts),
    "",
    `Correct behaviour is to abstain: ${fixture.expectedAbstention ? "yes" : "no"}`,
    "",
    "Score anchors (use exactly one of 0, 25, 50, 75, 100):",
    "0 = nothing useful, invented, or ignores the question",
    "25 = some progress, major criteria unmet",
    "50 = partial, some expected facts",
    "75 = mostly complete, minor issues",
    "100 = all acceptance criteria and expected facts met",
    "A forbidden fact claimed as true caps the score at 25.",
    "If correct behaviour is to abstain, 100 requires the answer to say the information is not available and to invent nothing.",
    "Set abstained to true when the answer says it cannot find the information.",
    "",
    "Answer to grade:",
    "<answer>",
    answer,
    "</answer>",
  ].join("\n");
}
