import type { MemoryStatus } from "@vmem/sdk";
import { classifySource, isLowPriorSource } from "../usefulness";
import type { DreamCandidateKind } from "./candidates";

// nightly dreaming (plan §3c): limits and the pure rules the steps share

const DAY_MS = 24 * 60 * 60 * 1000;

// rows read by the window, expire and decay scans, per profile per run
export const DREAM_MAX_SCAN_ROWS = 2_000;
export const DREAM_MAX_DECAY_ACTIONS = 500;
export const DREAM_BATCH_ROWS = 100;
// peers read per hash / source key lookup
export const DREAM_PEER_LIMIT = 25;

// first run of a profile: only the last day; older rows wait for the
// one-off cleanup (dreamCleanup), which the user approves
export const DREAM_FIRST_WINDOW_MS = DAY_MS;
export const DECAY_IDLE_MS = 30 * DAY_MS;
const DECAY_MAX_VISITS = 2;
const DECAY_MAX_USEFULNESS = 0.2;

// AI steps (near-dup judge, conflict judge): calls per user per night, all
// profiles together
export const DREAM_MAX_AI_CALLS_BY_KIND: Readonly<
  Record<DreamCandidateKind, number>
> = { near_dup: 25, maybe_conflict: 15 };
export const DREAM_MAX_AI_CALLS = 40;
// all users together, per UTC day, summed from openRouterLogs feature "dream";
// shared with the one-off cleanup
export const DREAM_DAILY_BUDGET_USD = 0.5;
// an AI-judged merge / supersede applies without a proposal only at or above
// this, and only with dreamModeAutoAccept
export const DREAM_AI_APPLY_MIN = 0.9;

export function startOfUtcDay(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

// calls left for one user tonight
export interface DreamAiAllowance {
  byKind: Record<DreamCandidateKind, number>;
  total: number;
}

export function fullAiAllowance(): DreamAiAllowance {
  return {
    byKind: { ...DREAM_MAX_AI_CALLS_BY_KIND },
    total: DREAM_MAX_AI_CALLS,
  };
}

/**
 * Why the next judge call of this kind may not run: "cap" when the kind's or
 * the user's nightly calls are used up, "budget" once today's dream spend
 * (all users) reached the daily budget. Null means call.
 */
export function aiCallStop(
  allowance: DreamAiAllowance,
  kind: DreamCandidateKind,
  spentTodayUsd: number,
): "cap" | "budget" | null {
  if (allowance.total <= 0 || allowance.byKind[kind] <= 0) return "cap";
  if (spentTodayUsd >= DREAM_DAILY_BUDGET_USD) return "budget";
  return null;
}

export function spendAiCall(
  allowance: DreamAiAllowance,
  kind: DreamCandidateKind,
): DreamAiAllowance {
  return {
    byKind: { ...allowance.byKind, [kind]: allowance.byKind[kind] - 1 },
    total: allowance.total - 1,
  };
}

/**
 * An "update" verdict may supersede the older row only when both rows come
 * from the same source family (deliberate, connector or passive capture),
 * so a browsing row never replaces an agent fact.
 */
export function sameSourceFamily(
  a: { source: string; sourceType?: string },
  b: { source: string; sourceType?: string },
): boolean {
  return (
    classifySource(a.source, a.sourceType) ===
    classifySource(b.source, b.sourceType)
  );
}

// what one judged pair does. apply: change at once (undoable), else an
// inbox proposal
export type DreamPairAction =
  | { kind: "merge"; apply: boolean }
  | { kind: "supersede"; apply: boolean }
  | { kind: "contradiction" }
  | { kind: "drop" }
  | { kind: "none" };

/**
 * duplicate → merge, applied only with auto-accept and confidence >= 0.9;
 * update → supersede the older row, applied only with auto-accept,
 * confidence >= 0.9 and the same source family; contradiction → always a
 * proposal; unrelated → drop the candidate; none (not a duplicate, or the
 * call failed) → nothing.
 */
export function dreamPairAction(input: {
  relation: "duplicate" | "update" | "contradiction" | "unrelated" | "none";
  confidence: number;
  autoAccept: boolean;
  sameFamily: boolean;
}): DreamPairAction {
  const confident = input.autoAccept && input.confidence >= DREAM_AI_APPLY_MIN;
  switch (input.relation) {
    case "duplicate":
      return { kind: "merge", apply: confident };
    case "update":
      return { kind: "supersede", apply: confident && input.sameFamily };
    case "contradiction":
      return { kind: "contradiction" };
    case "unrelated":
      return { kind: "drop" };
    case "none":
      return { kind: "none" };
  }
}

export interface DreamCounts {
  exactMerged: number;
  keyMerged: number;
  nearDupMerged: number;
  superseded: number;
  proposals: number;
  expired: number;
  archived: number;
  aiFlagged: number;
}

export function emptyDreamCounts(): DreamCounts {
  return {
    exactMerged: 0,
    keyMerged: 0,
    nearDupMerged: 0,
    superseded: 0,
    proposals: 0,
    expired: 0,
    archived: 0,
    aiFlagged: 0,
  };
}

export function addDreamCounts(
  a: DreamCounts,
  b: Partial<DreamCounts>,
): DreamCounts {
  return {
    exactMerged: a.exactMerged + (b.exactMerged ?? 0),
    keyMerged: a.keyMerged + (b.keyMerged ?? 0),
    nearDupMerged: a.nearDupMerged + (b.nearDupMerged ?? 0),
    superseded: a.superseded + (b.superseded ?? 0),
    proposals: a.proposals + (b.proposals ?? 0),
    expired: a.expired + (b.expired ?? 0),
    archived: a.archived + (b.archived ?? 0),
    aiFlagged: a.aiFlagged + (b.aiFlagged ?? 0),
  };
}

export function changedRows(counts: DreamCounts): number {
  return (
    counts.exactMerged +
    counts.keyMerged +
    counts.nearDupMerged +
    counts.superseded +
    counts.proposals +
    counts.expired +
    counts.archived
  );
}

export interface DecayRow {
  source: string;
  sourceType?: string;
  status: MemoryStatus;
  lastVisitAt: number;
  visitCount: number;
  usefulnessScore?: number;
}

/**
 * Archive rule: low-prior source (browsing history, bookmarks, desktop), not
 * visited for 30 days, at most 2 visits, usefulness below 0.2, never
 * retrieved, and active (a pinned row never decays). A row with no
 * usefulness score yet is kept.
 */
export function isDecayCandidate(
  row: DecayRow,
  usageHits: number,
  now: number,
): boolean {
  return (
    row.status === "active" &&
    isLowPriorSource(row.source, row.sourceType) &&
    row.lastVisitAt < now - DECAY_IDLE_MS &&
    row.visitCount <= DECAY_MAX_VISITS &&
    row.usefulnessScore !== undefined &&
    row.usefulnessScore < DECAY_MAX_USEFULNESS &&
    usageHits === 0
  );
}
