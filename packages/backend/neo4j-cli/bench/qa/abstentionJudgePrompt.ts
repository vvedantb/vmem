/**
 * Abstention judge prompt for negative/abstention questions (LongMemEval `_abs`,
 * BEAM `abstention`).
 *
 * For these, the stored memory contains NO answer and the correct behaviour is to
 * DECLINE. The standard gold-answer judge (`judgePrompt.ts`) grades factual
 * overlap and would mark a correct refusal WRONG, so abstention rows are graded
 * with this prompt instead: correct ⇔ the model abstains rather than fabricating.
 *
 * Output is the SAME JSON shape as `judgePrompt.ts`
 * (`{"correct": boolean, "reasoning": string}`), so `parseJudgeResponse` parses both.
 */

export function buildAbstentionJudgePrompt(
  question: string,
  goldAnswer: string,
  generatedAnswer: string,
): string {
  return `You are grading an ABSTENTION question for a long-conversation QA benchmark.

The stored memory does NOT contain the information needed to answer, so the CORRECT behaviour is to DECLINE — to say the information is not available, not mentioned, or cannot be determined from the conversation.

- Mark CORRECT when the generated answer declines / abstains / states the information is not present or cannot be determined.
- Mark WRONG when the generated answer asserts a specific factual answer as if it were known (a hallucination), even if it hedges.

# Question
${question}

# Expected (the reference abstention)
${goldAnswer}

# Generated answer
${generatedAnswer}

# Output
Respond with ONLY this JSON: {"correct": true | false, "reasoning": "<one short sentence>"}`;
}
