import { ActionRetrier } from "@convex-dev/action-retrier";
import { components } from "./_generated/api";

/**
 * Shared retrier client for idempotent external-service actions.
 *
 * Only use for fire-and-forget schedules (e.g. `scheduler.runAfter(0, ...)`),
 * since `retrier.run()` returns a `RunId` rather than the action's result.
 * In-action SDK/fetch retries (OpenRouter, GitHub tarball) use `p-retry`
 * instead — ActionRetrier cannot return embedding/repo payloads to the caller.
 *
 * Backoff schedule with defaults below: 500ms → 1s → 2s → 4s (4 attempts total).
 */
export const retrier = new ActionRetrier(components.actionRetrier, {
  initialBackoffMs: 500,
  base: 2,
  maxFailures: 4,
});
