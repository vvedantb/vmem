import { z } from "zod";

/**
 * Convex nests actions across runtimes, and a re-thrown error often arrives
 * without its Error prototype — the text can survive under `message` or `data`
 * on a plain object instead. This schema captures both so a best-effort
 * message can be pulled from whatever shape shows up.
 */
const errorLikeSchema = z.object({
  message: z.string().optional(),
  data: z.string().optional(),
});

/**
 * Best-effort human message from an arbitrary thrown value. Takes `unknown` so
 * callers pass their raw `catch` value straight in — no pre-narrowing. Tries,
 * in order: a non-empty string, a real Error's message/name, then a
 * `{ message }` / `{ data }` object, falling back to a generic line.
 */
export function formatSyncError(err: unknown): string {
  if (typeof err === "string" && err.length > 0) return err;
  if (err instanceof Error) {
    if (err.message.length > 0) return err.message;
    if (err.name.length > 0) return err.name;
  }
  const parsed = errorLikeSchema.safeParse(err);
  if (parsed.success) {
    if (parsed.data.message && parsed.data.message.length > 0) {
      return parsed.data.message;
    }
    if (parsed.data.data && parsed.data.data.length > 0) {
      return parsed.data.data;
    }
  }
  return "Codebase sync failed";
}
