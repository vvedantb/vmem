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
