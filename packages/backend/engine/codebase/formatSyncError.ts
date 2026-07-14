import { z } from "zod";

/** Convex rethrows often lose Error prototype; message may be under `message` or `data`. */
const errorLikeSchema = z.object({
  message: z.string().optional(),
  data: z.string().optional(),
});

export function formatSyncError(err: unknown): string {
  if (typeof err === "string" && err.length > 0) return err;
  if (err instanceof Error) {
    if (err.message.length > 0) return err.message;
    if (err.name.length > 0) return err.name;
  }
  const parsed = errorLikeSchema.safeParse(err);
  if (parsed.success) {
    const { message, data } = parsed.data;
    if (message && message.length > 0) return message;
    if (data && data.length > 0) return data;
  }
  return "Codebase sync failed";
}
