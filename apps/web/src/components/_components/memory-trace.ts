import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";

type RetrieveResult = FunctionReturnType<typeof api.memoryApi.retrieveMemories>;

export type MemoryCandidate = RetrieveResult["memories"][number];

// context Trace payload attached to hybrid-search memory rows
export type MemoryTrace = MemoryCandidate["trace"];

export function relativeRelevanceScore(
  score: number,
  maxScore: number,
): number {
  if (maxScore <= 0) return 0;
  return score / maxScore;
}
