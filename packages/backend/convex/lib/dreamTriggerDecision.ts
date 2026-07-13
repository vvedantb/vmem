/** Pure dream-trigger decision logic (unit-tested). */

export const QUIET_MS = 30 * 60 * 1000;
export const MIN_NEW_MEMORIES = 5;
export const PILE_THRESHOLD = 25;
export const MIN_GAP_MS = 2 * 60 * 60 * 1000;
export const DAILY_CAP = 4;

export type DreamDepth = "light" | "standard" | "deep";

export interface DreamTriggerSnapshot {
  newMemoryCount: number;
  lastWriteAt: number;
  lastAutoRunAt: number | null;
  runsToday: number;
  dayKey: string;
}

export type DreamTriggerDecision =
  | { action: "run"; depth: DreamDepth }
  | { action: "reschedule"; delayMs: number }
  | { action: "stop" };

export function dayKeyForUtc(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

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

  const runsToday = state.dayKey === dayKeyForUtc(now) ? state.runsToday : 0;
  if (runsToday >= DAILY_CAP) return { action: "stop" };
  if (state.lastAutoRunAt !== null && now - state.lastAutoRunAt < MIN_GAP_MS) {
    return { action: "stop" };
  }

  if (state.newMemoryCount >= PILE_THRESHOLD) {
    return { action: "run", depth: depthForCount(state.newMemoryCount) };
  }

  const idleMs = now - state.lastWriteAt;
  if (idleMs < QUIET_MS) {
    return { action: "reschedule", delayMs: QUIET_MS - idleMs };
  }

  if (state.newMemoryCount >= MIN_NEW_MEMORIES) {
    return { action: "run", depth: depthForCount(state.newMemoryCount) };
  }

  return { action: "stop" };
}
