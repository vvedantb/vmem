/**
 * Dream Mode V2 — per-profile rate-limit stamp.
 *
 * `runSetLastDreamRunAtInternal` is stamped by the per-profile runner
 * after every Dream Mode pass and used by the manual "Run Dream Mode"
 * button to enforce the 1-run-per-hour rate limit.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function runSetLastDreamRunAtInternal(
  ctx: MutationCtx,
  args: { profileId: Id<"profiles">; timestamp: number },
): Promise<null> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile) return null;
  await ctx.db.patch(args.profileId, { lastDreamRunAt: args.timestamp });
  return null;
}
