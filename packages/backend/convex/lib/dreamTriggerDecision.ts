/**
 * Dynamic Dreaming — the trigger decision, kept pure for unit testing.
 *
 * A memory write arms a debounced check (`scheduleDreamTriggerCheck`);
 * when the check fires this function decides whether to dream now, wait
 * longer, or stand down. Two ways in, per the design:
 *
 *   1. The user went QUIET after enough new memories piled up.
 *   2. Enough context piled up that we dream even mid-activity
 *      (`PILE_THRESHOLD`) — bounded by the run-gap + daily cap.
 *
 * "stop" never loses progress: `newMemoryCount` persists on the state
 * row, so the next memory write re-arms the check and the accumulated
 * count still counts.
 */

/** No dream while the user is still writing — quiet means 30 min idle. */
export const QUIET_MS = 30 * 60 * 1000;
/** Minimum new memories before a quiet period is worth dreaming on. */
export const MIN_NEW_MEMORIES = 5;
/** Enough piled-up context to dream even if the user is still active. */
export const PILE_THRESHOLD = 25;
/** Minimum gap between automatic runs. */
export const MIN_GAP_MS = 2 * 60 * 60 * 1000;
/** Maximum automatic runs per UTC day. */
export const DAILY_CAP = 4;

/** How deep a dream pass goes — scales anomaly/merge budgets in runProfile. */
export type DreamDepth = "light" | "standard" | "deep";

export interface DreamTriggerSnapshot {
  newMemoryCount: number;
  lastWriteAt: number;
  lastAutoRunAt: number | null;
  runsToday: number;
  /** UTC day "YYYY-MM-DD" that `runsToday` counts against. */
  dayKey: string;
}

export type DreamTriggerDecision =
  | { action: "run"; depth: DreamDepth }
  | { action: "reschedule"; delayMs: number }
  | { action: "stop" };

/** UTC day key for daily-cap accounting. */
export function dayKeyForUtc(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Depth scales with how much new context piled up since the last run. */
export function depthForCount(newMemoryCount: number): DreamDepth {
  if (newMemoryCount < 10) return "light";
  if (newMemoryCount <= 25) return "standard";
  return "deep";
}

export function decideDreamCheck(
  state: DreamTriggerSnapshot,
  automaticEnabled: boolean,
  now: number,
): DreamTriggerDecision {
  if (!automaticEnabled) return { action: "stop" };

  // Day rollover resets the cap; a stale dayKey means runsToday is from a
  // previous day and no longer counts.
  const runsToday = state.dayKey === dayKeyForUtc(now) ? state.runsToday : 0;
  if (runsToday >= DAILY_CAP) return { action: "stop" };
  if (state.lastAutoRunAt !== null && now - state.lastAutoRunAt < MIN_GAP_MS) {
    return { action: "stop" };
  }

  // Enough context piled up — dream even mid-activity.
  if (state.newMemoryCount >= PILE_THRESHOLD) {
    return { action: "run", depth: depthForCount(state.newMemoryCount) };
  }

  // Still writing — wait out the rest of the quiet window.
  const idleMs = now - state.lastWriteAt;
  if (idleMs < QUIET_MS) {
    return { action: "reschedule", delayMs: QUIET_MS - idleMs };
  }

  if (state.newMemoryCount >= MIN_NEW_MEMORIES) {
    return { action: "run", depth: depthForCount(state.newMemoryCount) };
  }

  return { action: "stop" };
}
