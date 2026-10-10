import { v } from "convex/values";
import { zodToConvex } from "convex-helpers/server/zod";
import {
  memoryWithTagsSchema,
  type MemoryType,
  type MemoryWithTags,
} from "@vmem/sdk";
import { internal } from "../_generated/api";
import { buildSearchableText } from "../../engine/memory/searchableText";
import {
  runAssertMemoryMutablePermissionInternal,
  runAssertProfileAccessInternal,
  runResolveMemoryScopeInternal,
  type AuthMutationCtx,
  type AuthQueryCtx,
} from "../teams/auth";
import { getOrCreateDefaultProfile } from "../profiles/helpers";
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
import type { MemoryListResult } from "./types";

type ListArgs = {
  profileId?: string;
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  limit: number;
  offset: number;
};

type CreateArgs = {
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
  profileId?: string;
  externalId?: string;
  sourceType?: string;
};

type UpdateArgs = {
  memoryId: string;
  profileId?: string;
  title?: string;
  content?: string;
  type?: MemoryType;
  status?: MemoryWithTags["status"];
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
};

export const memoryWithTagsValidator = zodToConvex(memoryWithTagsSchema);
export const memoryListResultValidator = v.object({
  memories: v.array(memoryWithTagsValidator),
  total: v.number(),
});

async function requireClerkId(
  ctx: AuthQueryCtx | AuthMutationCtx,
): Promise<string> {
  const user = await ctx.db.get(ctx.userId);
  if (!user?.clerkId) throw new Error("User has no clerkId");
  return user.clerkId;
}

async function scheduleCreatedMemoryJobs(
  ctx: AuthMutationCtx,
  clerkId: string,
  created: MemoryWithTags,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.memoryEmbed.embedMemoryInternal, {
    clerkId,
    memoryId: created.id,
    profileId: created.profileId ?? undefined,
    text: buildSearchableText(created.title, created.content, created.tags),
  });
  await ctx.scheduler.runAfter(
    0,
    internal.memoryExtract.extractMemoryEntitiesInternal,
    {
      clerkId,
      memoryId: created.id,
      profileId: created.profileId ?? undefined,
      updatedAt: created.updatedAt,
    },
  );
}

async function scheduleUpdatedMemoryJobs(
  ctx: AuthMutationCtx,
  clerkId: string,
  updated: MemoryWithTags,
  contentChanged: boolean,
): Promise<void> {
  if (!contentChanged) return;
  await ctx.scheduler.runAfter(0, internal.memoryEmbed.embedMemoryInternal, {
    clerkId,
    memoryId: updated.id,
    profileId: updated.profileId ?? undefined,
    text: buildSearchableText(updated.title, updated.content, updated.tags),
  });
  await ctx.scheduler.runAfter(
    0,
    internal.memoryExtract.extractMemoryEntitiesInternal,
    {
      clerkId,
      memoryId: updated.id,
      profileId: updated.profileId ?? undefined,
      updatedAt: updated.updatedAt,
    },
  );
}

function listParams(args: {
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  limit: number;
  offset: number;
}) {
  return {
    type: args.type,
    status: args.status,
    source: args.source,
    tags: args.tags,
    searchQuery: args.searchQuery,
    limit: args.limit,
    offset: args.offset,
  };
}

async function listForCaller(
  ctx: AuthQueryCtx,
  args: {
    profileId?: string;
    type?: string;
    status?: string;
    source?: string;
    tags?: string[];
    searchQuery?: string;
    limit: number;
    offset: number;
  },
): Promise<MemoryListResult> {
  const scope = await runResolveMemoryScopeInternal(ctx, {
    userId: ctx.userId,
    profileId: args.profileId,
  });
  const params = listParams(args);
  if (scope.kind === "team") {
    return listMemoriesForTeam(ctx, scope.profileId, params);
  }
  return listMemories(ctx, scope.clerkId, {
    ...params,
    profileId: args.profileId,
  });
}

type MemoryCallerCtx = AuthQueryCtx | AuthMutationCtx;

async function getForCaller(
  ctx: MemoryCallerCtx,
  args: { memoryId: string; profileId?: string },
): Promise<MemoryWithTags | null> {
  const scope = await runResolveMemoryScopeInternal(ctx, {
    userId: ctx.userId,
    profileId: args.profileId,
  });
  if (scope.kind === "team") {
    return getMemoryForTeam(ctx, scope.profileId, args.memoryId);
  }
  return getMemory(ctx, scope.clerkId, args.memoryId);
}

async function resolveWriteProfileId(
  ctx: AuthMutationCtx,
  profileId: string | undefined,
): Promise<string> {
  if (profileId !== undefined) {
    const profile = await runAssertProfileAccessInternal(ctx, {
      profileId,
      userId: ctx.userId,
    });
    return profile._id;
  }
  const fallback = await getOrCreateDefaultProfile(ctx, ctx.userId);
  return fallback._id;
}

async function assertMutable(
  ctx: AuthMutationCtx,
  memory: MemoryWithTags,
  profileId: string | undefined,
): Promise<void> {
  const normalized =
    profileId === undefined
      ? undefined
      : ctx.db.normalizeId("profiles", profileId);
  await runAssertMemoryMutablePermissionInternal(ctx, {
    userId: ctx.userId,
    memoryCreatorClerkId: memory.userId,
    profileId: normalized ?? undefined,
  });
}

export async function runList(
  ctx: AuthQueryCtx,
  args: ListArgs,
): Promise<MemoryListResult> {
  return listForCaller(ctx, args);
}

export async function runGet(
  ctx: AuthQueryCtx,
  args: { memoryId: string; profileId?: string },
): Promise<MemoryWithTags | null> {
  return getForCaller(ctx, args);
}

export async function runCreate(
  ctx: AuthMutationCtx,
  args: CreateArgs,
): Promise<MemoryWithTags> {
  const clerkId = await requireClerkId(ctx);
  const profileId = await resolveWriteProfileId(ctx, args.profileId);
  const created = await createMemory(ctx, {
    userId: clerkId,
    profileId,
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
  await scheduleCreatedMemoryJobs(ctx, clerkId, created);
  return created;
}

export async function runUpdate(
  ctx: AuthMutationCtx,
  args: UpdateArgs,
): Promise<MemoryWithTags | null> {
  const clerkId = await requireClerkId(ctx);
  const existing = await getForCaller(ctx, {
    memoryId: args.memoryId,
    profileId: args.profileId,
  });
  if (!existing) throw new Error("Memory not found");
  await assertMutable(ctx, existing, args.profileId);
  const contentChanged =
    args.title !== undefined ||
    args.content !== undefined ||
    args.tags !== undefined;
  const updated = await updateMemory(ctx, existing.userId, args.memoryId, {
    title: args.title,
    content: args.content,
    type: args.type,
    status: args.status,
    tags: args.tags,
    confidence: args.confidence,
    expiresAt: args.expiresAt,
  });
  if (updated) {
    await scheduleUpdatedMemoryJobs(
      ctx,
      existing.userId === clerkId ? clerkId : existing.userId,
      updated,
      contentChanged,
    );
  }
  return updated;
}

export async function runRemove(
  ctx: AuthMutationCtx,
  args: { memoryId: string; profileId?: string },
): Promise<boolean> {
  const clerkId = await requireClerkId(ctx);
  const existing = await getForCaller(ctx, {
    memoryId: args.memoryId,
    profileId: args.profileId,
  });
  if (!existing) return false;
  await assertMutable(ctx, existing, args.profileId);
  if (existing.userId === clerkId) {
    return deleteMemory(ctx, clerkId, args.memoryId);
  }
  if (args.profileId === undefined) return false;
  return deleteTeamMemoryAsOwner(ctx, args.profileId, args.memoryId);
}
