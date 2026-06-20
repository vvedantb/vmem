/**
 * LoCoMo answer-generation prompt.
 *
 * Adapted (paraphrased, not copied verbatim) from mem0's
 * `memory-benchmarks/benchmarks/locomo/prompts.py`. The upstream prompt is
 * the methodology reference; this is a faithful re-expression of its
 * seven-step structure. Because the SAME prompt drives every provider row,
 * cross-system comparability holds regardless of exact wording.
 *
 * Placeholders: the retrieved memories, the question, and a reference date
 * (the conversation's latest session timestamp, or 2023 as the LoCoMo
 * default).
 */

import type { BenchSearchResult } from "../providers/types";

const ANSWER_STEPS = `Work through these steps before answering:
1. Scan every memory below — do not stop early. The answer may sit in a late entry.
2. Verify attribution: confirm which speaker a fact belongs to before using it.
3. Combine facts across memories when needed; decompose compound statements; enumerate items explicitly before counting them.
4. Prefer specific details (names, titles, numbers, dates) over generic descriptions, and prefer direct statements over facts inferred from photo captions.
5. Ground the answer in time using the reference date. When several similar events occur on different dates, choose by tense and proximity to the reference date, not by retrieval order.
6. Include every item that has supporting evidence; do not over-filter.
7. Answer directly with no hedging. State only details that appear in the memories. For open-domain/reasoning questions, follow direct causal reasoning without elaborate counter-arguments.`;

export function buildAnswerPrompt(
  question: string,
  memories: BenchSearchResult[],
  referenceDate: string,
): string {
  const joined = memories
    .map((m, idx) => `${String(idx + 1)}. ${m.text}`)
    .join("\n");
  const memoryBlock = joined.length > 0 ? joined : "(no memories retrieved)";

  return `You answer questions about a long conversation using only the retrieved memories below.

Reference date: ${referenceDate || "2023"}

${ANSWER_STEPS}

# Memories
${memoryBlock}

# Question
${question}

# Answer
Give the shortest complete answer that the memories support. No preamble, no explanation.`;
}
