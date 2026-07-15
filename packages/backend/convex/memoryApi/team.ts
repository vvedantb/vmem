import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireClerkId, type AuthActionCtx } from "../auth";
import { assertTeamAccess } from "./auth";
import type { MemoryWithTags, MemoryListResult } from "./types";
import type {
  TeamListMemoriesArgs,
  UpdateMemoryInternalArgs,
} from "./validators";

type ListTeamMemoriesArgs = TeamListMemoriesArgs & {
  profileId: Id<"profiles">;
};

export async function runListTeamMemories(
  ctx: AuthActionCtx,
  args: ListTeamMemoriesArgs,
): Promise<MemoryListResult> {
  await assertTeamAccess(ctx, args.profileId);
  return await ctx.runAction(
    internal.neo4jActions.memories.listMemoriesForTeamInternal,
    {
      profileId: args.profileId,
      type: args.type,
      status: args.status,
      source: args.source,
      tags: args.tags,
      searchQuery: args.searchQuery,
      limit: args.limit,
      offset: args.offset,
    },
  );
}

export async function runGetTeamMemory(
  ctx: AuthActionCtx,
  args: { profileId: Id<"profiles">; memoryId: string },
): Promise<MemoryWithTags | null> {
  await assertTeamAccess(ctx, args.profileId);
  return await ctx.runAction(
    internal.neo4jActions.memories.getMemoryForTeamInternal,
    { profileId: args.profileId, memoryId: args.memoryId },
  );
}

type UpdateTeamMemoryArgs = {
  profileId: Id<"profiles">;
  memoryId: string;
} & Pick<
  UpdateMemoryInternalArgs,
  "title" | "content" | "type" | "status" | "tags" | "confidence" | "expiresAt"
>;

async function loadMutableTeamMemory(
  ctx: AuthActionCtx,
  args: { profileId: Id<"profiles">; memoryId: string },
): Promise<MemoryWithTags | null> {
  await assertTeamAccess(ctx, args.profileId);

  const memory = await ctx.runAction(
    internal.neo4jActions.memories.getMemoryForTeamInternal,
    { profileId: args.profileId, memoryId: args.memoryId },
  );
  if (!memory) return null;

  // per-user Cypher matches on creator clerkId (including owner-as-caller)
  await ctx.runQuery(internal.teams.assertMemoryMutablePermissionInternal, {
    userId: ctx.userId,
    memoryCreatorClerkId: memory.userId,
    profileId: args.profileId,
  });

  return memory;
}

export async function runUpdateTeamMemory(
  ctx: AuthActionCtx,
  args: UpdateTeamMemoryArgs,
): Promise<MemoryWithTags | null> {
  await requireClerkId(ctx);

  const memory = await loadMutableTeamMemory(ctx, {
    profileId: args.profileId,
    memoryId: args.memoryId,
  });
  if (!memory) throw new Error("Memory not found");

  return await ctx.runAction(
    internal.neo4jActions.memories.updateMemoryInternal,
    {
      clerkId: memory.userId,
      memoryId: args.memoryId,
      title: args.title,
      content: args.content,
      type: args.type,
      status: args.status,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
    },
  );
}

export async function runDeleteTeamMemory(
  ctx: AuthActionCtx,
  args: { profileId: Id<"profiles">; memoryId: string },
): Promise<boolean> {
  const callerClerkId = await requireClerkId(ctx);

  const memory = await loadMutableTeamMemory(ctx, {
    profileId: args.profileId,
    memoryId: args.memoryId,
  });
  if (!memory) return false;

  if (memory.userId === callerClerkId) {
    return await ctx.runAction(
      internal.neo4jActions.memories.deleteMemoryInternal,
      { clerkId: callerClerkId, memoryId: args.memoryId },
    );
  }

  return await ctx.runAction(
    internal.neo4jActions.memories.deleteTeamMemoryAsOwnerInternal,
    {
      profileId: args.profileId,
      memoryId: args.memoryId,
      ownerClerkId: callerClerkId,
    },
  );
}
