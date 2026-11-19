import { expect } from "vitest";

// convex-test gives each query and mutation one fixed `Date.now()`, and that
// time is never earlier than the last commit, rounded up to the millisecond.
// With a frozen fake clock, a write is thus stamped with the clock time or
// with the next millisecond. Which one depends on the number of earlier
// commits, so an assertion on a stamp accepts both.
export function stampedAt(clockMs: number): number {
  return expect.toBeOneOf([clockMs, clockMs + 1]);
}

// A clock step that lets a rule with a minimum interval pass again: the last
// write can be stamped 1 ms after the clock time (see above).
export const STAMP_DRIFT_MS = 1;
