import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  createMemory,
  deleteMemory,
  deleteTeamMemoryAsOwner,
  getMemory,
  getMemoryForTeam,
  listMemories,
  listMemoriesForTeam,
  updateMemory,
} from "../memoryStore/helpers";
import { getOrCreateDefaultProfile } from "../profiles/helpers";
import {
  runAssertMemoryMutablePermissionInternal,
  runAssertProfileAccessInternal,
} from "../teams/auth";
import type { MemoryListResult, MemoryWithTags } from "./types";
import type {
  CreateMemoryInternalArgs,
  ListMemoriesInternalArgs,
  UpdateMemoryInternalArgs,
} from "./validators";

type AuthedCtx<C> = C & { userId: Id<"users"> };

export type CreateMemoryClientArgs = Omit<CreateMemoryInternalArgs, "clerkId">;
export type ListMemoriesClientArgs = Omit<ListMemoriesInternalArgs, "clerkId">;
export type UpdateMemoryClientArgs = Omit<
  UpdateMemoryInternalArgs,
  "clerkId"
> & {
  profileId?: string;
};

async function requireClerkId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<string> {
  const user = await ctx.db.get(userId);
  if (!user?.clerkId) throw new Error("User not found");
  return user.clerkId;
}

function asQueryCtx(ctx: QueryCtx | MutationCtx): QueryCtx {
  return ctx;
}

async function requireAccessibleProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  profileId: string,
): Promise<Doc<"profiles">> {
  return await runAssertProfileAccessInternal(asQueryCtx(ctx), {
    profileId,
    userId,
  });
}

async function resolveListProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  profileId: string | undefined,
): Promise<Doc<"profiles"> | null> {
  if (profileId === undefined) return null;
  return await requireAccessibleProfile(ctx, userId, profileId);
}

export async function listMemoriesForAuthedUser(
  ctx: AuthedCtx<QueryCtx | MutationCtx>,
  args: ListMemoriesClientArgs,
): Promise<MemoryListResult> {
  const clerkId = await requireClerkId(ctx, ctx.userId);
  const profile = await resolveListProfile(ctx, ctx.userId, args.profileId);
  const filters = {
    type: args.type,
    status: args.status,
    source: args.source,
    tags: args.tags,
    searchQuery: args.searchQuery,
    limit: args.limit,
    offset: args.offset,
  };
  if (profile?.teamId !== undefined) {
    return await listMemoriesForTeam(ctx, profile._id, filters);
  }
  return await listMemories(ctx, clerkId, {
    ...filters,
    profileId: args.profileId,
  });
}

export async function getMemoryForAuthedUser(
  ctx: AuthedCtx<QueryCtx | MutationCtx>,
  args: { memoryId: string; profileId?: string },
): Promise<MemoryWithTags | null> {
  const clerkId = await requireClerkId(ctx, ctx.userId);
  const profile = await resolveListProfile(ctx, ctx.userId, args.profileId);
  if (profile?.teamId !== undefined) {
    return await getMemoryForTeam(ctx, profile._id, args.memoryId);
  }
  return await getMemory(ctx, clerkId, args.memoryId);
}

export async function createMemoryForAuthedUser(
  ctx: AuthedCtx<MutationCtx>,
  args: CreateMemoryClientArgs,
): Promise<MemoryWithTags> {
  const clerkId = await requireClerkId(ctx, ctx.userId);
  const profile =
    args.profileId === undefined
      ? await getOrCreateDefaultProfile(ctx, ctx.userId)
      : await requireAccessibleProfile(ctx, ctx.userId, args.profileId);
  return await createMemory(ctx, {
    userId: clerkId,
    profileId: profile._id,
    title: args.title,
    content: args.content,
    type: args.type,
    source: args.source,
    tags: args.tags,
    confidence: args.confidence,
    expiresAt: args.expiresAt,
    url: args.url,
    sourceType: args.sourceType ?? args.source,
    sourceId: args.externalId,
  });
}

export async function updateMemoryForAuthedUser(
  ctx: AuthedCtx<MutationCtx>,
  args: UpdateMemoryClientArgs,
): Promise<MemoryWithTags | null> {
  const clerkId = await requireClerkId(ctx, ctx.userId);
  const profile = await resolveListProfile(ctx, ctx.userId, args.profileId);
  const existing =
    profile?.teamId !== undefined
      ? await getMemoryForTeam(ctx, profile._id, args.memoryId)
      : await getMemory(ctx, clerkId, args.memoryId);
  if (!existing) throw new Error("Memory not found");
  await runAssertMemoryMutablePermissionInternal(asQueryCtx(ctx), {
    userId: ctx.userId,
    memoryCreatorClerkId: existing.userId,
    profileId: profile?._id,
  });
  return await updateMemory(ctx, existing.userId, args.memoryId, {
    title: args.title,
    content: args.content,
    type: args.type,
    status: args.status,
    tags: args.tags,
    confidence: args.confidence,
    expiresAt: args.expiresAt,
  });
}

export async function deleteMemoryForAuthedUser(
  ctx: AuthedCtx<MutationCtx>,
  args: { memoryId: string; profileId?: string },
): Promise<boolean> {
  const clerkId = await requireClerkId(ctx, ctx.userId);
  const profile = await resolveListProfile(ctx, ctx.userId, args.profileId);
  if (profile?.teamId === undefined) {
    return await deleteMemory(ctx, clerkId, args.memoryId);
  }
  const existing = await getMemoryForTeam(ctx, profile._id, args.memoryId);
  if (!existing) return false;
  await runAssertMemoryMutablePermissionInternal(asQueryCtx(ctx), {
    userId: ctx.userId,
    memoryCreatorClerkId: existing.userId,
    profileId: profile._id,
  });
  if (existing.userId === clerkId) {
    return await deleteMemory(ctx, clerkId, args.memoryId);
  }
  return await deleteTeamMemoryAsOwner(ctx, profile._id, args.memoryId);
}
