import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireClerkId, type AuthActionCtx } from "../auth";
import type { MemoryWithTags, MemoryListResult } from "./types";
import type {
  TeamListMemoriesArgs,
  UpdateMemoryInternalArgs,
} from "./validators";
import {
  listMemoriesForTeamProfile,
  updateMemoryForClerk,
  deleteMemoryForClerk,
} from "../memoryRuntime";
import { scheduleContextPromptInvalidationByClerkId } from "../lib/contextPromptInvalidate";

type ListTeamMemoriesArgs = TeamListMemoriesArgs & {
  profileId: Id<"profiles">;
};

export async function runListTeamMemories(
  ctx: AuthActionCtx,
  args: ListTeamMemoriesArgs,
): Promise<MemoryListResult> {
  return await listMemoriesForTeamProfile(ctx, {
    profileId: args.profileId,
    type: args.type,
    status: args.status,
    source: args.source,
    tags: args.tags,
    searchQuery: args.searchQuery,
    limit: args.limit,
    offset: args.offset,
  });
}

export async function runGetTeamMemory(
  ctx: AuthActionCtx,
  args: { profileId: Id<"profiles">; memoryId: string },
): Promise<MemoryWithTags | null> {
  return await ctx.runQuery(
    internal.memoryStore.functions.getMemoryForTeamInternal,
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

async function loadPreauthorizedMutableTeamMemory(
  ctx: AuthActionCtx,
  args: { profileId: Id<"profiles">; memoryId: string },
): Promise<MemoryWithTags | null> {
  const memory = await runGetTeamMemory(ctx, args);
  if (!memory) return null;

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

  const memory = await loadPreauthorizedMutableTeamMemory(ctx, {
    profileId: args.profileId,
    memoryId: args.memoryId,
  });
  if (!memory) throw new Error("Memory not found");

  return await updateMemoryForClerk(ctx, {
    clerkId: memory.userId,
    memoryId: args.memoryId,
    title: args.title,
    content: args.content,
    type: args.type,
    status: args.status,
    tags: args.tags,
    confidence: args.confidence,
    expiresAt: args.expiresAt,
  });
}

export async function runDeleteTeamMemory(
  ctx: AuthActionCtx,
  args: { profileId: Id<"profiles">; memoryId: string },
): Promise<boolean> {
  const callerClerkId = await requireClerkId(ctx);

  const memory = await loadPreauthorizedMutableTeamMemory(ctx, {
    profileId: args.profileId,
    memoryId: args.memoryId,
  });
  if (!memory) return false;

  if (memory.userId === callerClerkId) {
    return await deleteMemoryForClerk(ctx, callerClerkId, args.memoryId);
  }

  const deleted = await ctx.runMutation(
    internal.memoryStore.functions.deleteTeamMemoryAsOwnerInternal,
    {
      profileId: args.profileId,
      memoryId: args.memoryId,
    },
  );
  if (deleted) {
    await scheduleContextPromptInvalidationByClerkId(ctx, memory.userId);
  }
  return deleted;
}
