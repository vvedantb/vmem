import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getUserByClerkId } from "../auth";

export async function getUserIdByClerkId(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
): Promise<Id<"users">> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) {
    throw new Error("User not found");
  }
  return user._id;
}

// The ctx an authQuery / authMutation handler gets, built from a verified
// clerk id. MCP *ByClerkIdInternal functions use it to call the same handler.
export async function withClerkUser<Ctx extends QueryCtx | MutationCtx>(
  ctx: Ctx,
  clerkId: string,
): Promise<Ctx & { userId: Id<"users"> }> {
  return { ...ctx, userId: await getUserIdByClerkId(ctx, clerkId) };
}
