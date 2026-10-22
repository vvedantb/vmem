import type { MemoryStatus } from "@vmem/sdk";
import { isLowPriorSource } from "../usefulness";

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
