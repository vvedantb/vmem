import { ConvexError } from "convex/values";

/**
 * Convex production hides `throw new Error(...)` behind a request-id wrapper.
 * Prefer `ConvexError` text, then an uncaught-error suffix, then `fallback`.
 * A catch variable is `unknown`, so this is the one place that narrows it.
 */
export function convexErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") {
    const text = err.data.trim();
    if (text.length > 0) return text;
  }
  if (err instanceof Error) {
    const uncaught = /Uncaught Error:\s*([^\n]+)/
      .exec(err.message)?.[1]
      ?.trim();
    if (uncaught) return uncaught;
    const text = err.message.trim();
    if (text.length > 0 && !text.startsWith("[CONVEX ")) return text;
  }
  return fallback;
}
