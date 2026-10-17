import { z } from "zod";

/**
 * Events are recorded only when something changes (focus, idle, pause), never
 * per poll and never per keystroke. Timestamps are epoch milliseconds.
 */
export const activityEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("focus"),
    at: z.number(),
    app: z.string(),
    title: z.string(),
  }),
  /** Ends the current focus session. Nothing is recorded until the next focus. */
  z.object({
    kind: z.literal("gap"),
    at: z.number(),
    reason: z.enum(["idle", "paused", "blocked", "unknown", "shutdown"]),
  }),
  z.object({ kind: z.literal("clipboard"), at: z.number(), text: z.string() }),
  z.object({ kind: z.literal("screenshot"), at: z.number(), file: z.string() }),
]);

export type ActivityEvent = z.infer<typeof activityEventSchema>;
