// write-time dream candidates (plan §3a step 3): flag near-dup and
// maybe-conflict pairs from vector neighbours. Nothing merges here; the
// nightly run judges the open rows.

const DAY_MS = 24 * 60 * 60 * 1000;

// neighbours kept per new memory (self excluded)
export const CANDIDATE_NEIGHBOUR_LIMIT = 3;
export const NEAR_DUP_MIN_SCORE = 0.97;
export const MAYBE_CONFLICT_MIN_SCORE = 0.88;
export const CANDIDATE_RETENTION_MS = 30 * DAY_MS;

export type DreamCandidateKind = "near_dup" | "maybe_conflict";

/** near_dup: cosine >= 0.97 and same type; maybe_conflict: 0.88-0.97 and a shared entity. */
export function classifyCandidate(input: {
  score: number;
  sameType: boolean;
  sharedEntity: boolean;
}): DreamCandidateKind | null {
  if (input.score >= NEAR_DUP_MIN_SCORE) {
    return input.sameType ? "near_dup" : null;
  }
  if (input.score >= MAYBE_CONFLICT_MIN_SCORE && input.sharedEntity) {
    return "maybe_conflict";
  }
  return null;
}

/** Same key for (a, b) and (b, a), so a pair is stored once. */
export function candidatePairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
