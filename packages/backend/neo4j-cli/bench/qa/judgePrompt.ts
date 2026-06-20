/**
 * LoCoMo LLM-as-judge prompt + parser.
 *
 * Adapted (paraphrased, not copied verbatim) from mem0's
 * `memory-benchmarks/benchmarks/locomo/prompts.py`. Encodes the same seven
 * grading rules: partial credit, paraphrase tolerance, extra-detail
 * tolerance, date tolerance (±14 days / 50% duration), semantic overlap,
 * same-referent match, and fact-recall focus. The SAME judge runs on every
 * provider row, so the absolute number depends on the judge but the relative
 * ranking between systems does not.
 *
 * Output is JSON `{ "correct": boolean, "reasoning": string }`.
 */

import { z } from "zod";
import { extractJsonString } from "../../../engine/llm/extractJsonString";

const JUDGE_RULES = `Grade the GENERATED answer against the GOLD answer using these rules:
1. Partial credit: if the generated answer contains at least one correct item from the gold answer, it is CORRECT.
2. Paraphrase: semantic equivalence counts (e.g. "chocolate raspberry tart" ≈ "chocolate cake with raspberries").
3. Extra detail: a longer answer that includes the gold facts plus extra information is CORRECT.
4. Date tolerance: dates within 14 days, or durations within 50%, are CORRECT.
5. Semantic overlap: same topic and core idea is CORRECT.
6. Same referent: a matching named entity is CORRECT.
7. Judge fact recall, not wording precision.

Mark WRONG only when the generated answer contains none of the gold items and is not otherwise supported.`;

export function buildJudgePrompt(
  question: string,
  goldAnswer: string,
  generatedAnswer: string,
): string {
  return `You are a strict but fair grader for a long-conversation QA benchmark.

${JUDGE_RULES}

# Question
${question}

# Gold answer
${goldAnswer}

# Generated answer
${generatedAnswer}

# Output
Respond with ONLY this JSON: {"correct": true | false, "reasoning": "<one short sentence>"}`;
}

const judgeSchema = z.object({
  correct: z.boolean(),
  reasoning: z.string().optional(),
});

export interface JudgeVerdict {
  correct: boolean;
  reasoning: string;
}

/**
 * Parse a judge response. Returns null on unparseable output so the caller
 * can decide how to treat it (the harness counts null verdicts as WRONG and
 * logs them, never silently dropping a question).
 */
export function parseJudgeResponse(raw: string): JudgeVerdict | null {
  try {
    const parsed = judgeSchema.parse(JSON.parse(extractJsonString(raw)));
    return { correct: parsed.correct, reasoning: parsed.reasoning ?? "" };
  } catch {
    return null;
  }
}
