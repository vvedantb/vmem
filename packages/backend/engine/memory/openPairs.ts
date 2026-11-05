import type { DreamCandidateKind } from "./dream/candidates";

// Open dreamCandidates pairs (write-time near-dup / maybe-conflict rows that
// nightly dreaming has not judged yet), applied to a retrieved set so recall
// and context_pack do not show both rows as independent facts.

/** One open pair, as public memory ids. */
export interface OpenPair {
  a: string;
  b: string;
  kind: DreamCandidateKind;
}

export interface HiddenDuplicate {
  id: string;
  keptId: string;
}

type PairedMemory = { id: string; createdAt: string };

// the newer row of a pair; on a tie (or a bad date) the higher-ranked row
function newerOf(
  left: PairedMemory,
  right: PairedMemory,
  rank: ReadonlyMap<string, number>,
): PairedMemory {
  const leftMs = Date.parse(left.createdAt);
  const rightMs = Date.parse(right.createdAt);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
    if (leftMs !== rightMs) return leftMs > rightMs ? left : right;
  }
  return (rank.get(left.id) ?? 0) <= (rank.get(right.id) ?? 0) ? left : right;
}

/**
 * near_dup: the older row is dropped (listed in `hidden`).
 * maybe_conflict: both rows stay, each gets the other in `conflictsWith`.
 * A pair counts only when both rows are in `memories`. Order is kept.
 */
export function applyOpenPairs<T extends PairedMemory>(
  memories: readonly T[],
  pairs: readonly OpenPair[],
): {
  memories: Array<T & { conflictsWith?: string[] }>;
  hidden: HiddenDuplicate[];
} {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  const rank = new Map(memories.map((memory, index) => [memory.id, index]));
  const hidden = new Map<string, string>();
  const conflicts: Array<[string, string]> = [];
  for (const pair of pairs) {
    const left = byId.get(pair.a);
    const right = byId.get(pair.b);
    if (left === undefined || right === undefined || left.id === right.id) {
      continue;
    }
    if (pair.kind === "maybe_conflict") {
      conflicts.push([left.id, right.id]);
      continue;
    }
    const kept = newerOf(left, right, rank);
    const older = kept.id === left.id ? right : left;
    if (!hidden.has(older.id)) hidden.set(older.id, kept.id);
  }
  const conflictsWith = new Map<string, string[]>();
  for (const [left, right] of conflicts) {
    // a hidden duplicate is not shown, so it is no conflict partner
    if (hidden.has(left) || hidden.has(right)) continue;
    conflictsWith.set(left, [...(conflictsWith.get(left) ?? []), right]);
    conflictsWith.set(right, [...(conflictsWith.get(right) ?? []), left]);
  }
  return {
    memories: memories
      .filter((memory) => !hidden.has(memory.id))
      .map((memory) => {
        const partners = conflictsWith.get(memory.id);
        return partners === undefined
          ? memory
          : { ...memory, conflictsWith: partners };
      }),
    hidden: [...hidden].map(([id, keptId]) => ({ id, keptId })),
  };
}
