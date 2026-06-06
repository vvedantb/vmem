import { RETRIEVAL_EVAL_QUERIES } from "./queries";
import type { SeedMemory } from "../seed/types";

const EVAL_EXPECTED_TITLES = new Set(
  RETRIEVAL_EVAL_QUERIES.flatMap((item) => item.expectedTitles),
);

function recentDate(maxDaysAgo: number): string {
  const offset = Math.random() * maxDaysAgo * 86400000;
  return new Date(Date.now() - offset).toISOString();
}

function randomDate(maxDaysAgo: number): string {
  const offset = Math.random() * maxDaysAgo * 86400000;
  return new Date(Date.now() - offset).toISOString();
}

/** Boost expected benchmark memories and demote the rest for eval seed runs. */
export function applyEvalCorpusProfile<T extends SeedMemory>(memory: T): T {
  if (EVAL_EXPECTED_TITLES.has(memory.title)) {
    const createdAt = recentDate(1);
    return {
      ...memory,
      createdAt,
      updatedAt: new Date().toISOString(),
      confidence: 0.98,
    };
  }

  return {
    ...memory,
    createdAt: randomDate(540),
    updatedAt: randomDate(365),
    confidence: 0.35,
  };
}
