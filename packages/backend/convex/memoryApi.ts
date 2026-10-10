import { v } from "convex/values";
import { internalAction, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authAction, authMutation, authQuery, requireClerkId } from "./auth";
import { routeMemoryByProfile } from "./memoryApi/routing";
import { runListTeamMemories } from "./memoryApi/team";
import type {
  MemoryListResult,
  MemoryWithTags,
  RetrieveMemoriesResult,
} from "./memoryApi/types";
import {
  createMemoryFields,
  listMemoriesFields,
  profileIdOptional,
  searchMemoriesFields,
  updateMemoryFields,
} from "./memoryApi/validators";
import {
  createMemoryForAuthedUser,
  deleteMemoryForAuthedUser,
  getMemoryForAuthedUser,
  listMemoriesForAuthedUser,
  updateMemoryForAuthedUser,
} from "./memoryApi/client";
import {
  listMemoriesForClerk,
  retrieveMemoriesForClerk,
  retrieveMemoriesForTeamProfile,
} from "./memoryRuntime";
import { buildSearchableText } from "../engine/memory/searchableText";
import { scheduleContextPromptInvalidationByClerkId } from "./lib/contextPromptInvalidate";
import { scheduleDreamTriggerCheck } from "./lib/dreamTriggerInvalidate";

export const generateMemoryUploadUrl = authMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const afterMemoryWriteInternal = internalAction({
  args: {
    clerkId: v.string(),
    kind: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("delete"),
    ),
    source: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
    if (args.kind === "create" && args.source !== "dream-merge") {
      await scheduleDreamTriggerCheck(ctx, args.clerkId);
    }
    return null;
  },
});

async function scheduleMemoryWriteFollowUp(
  ctx: MutationCtx,
  args: {
    clerkId: string;
    kind: "create" | "update" | "delete";
    source?: string;
    memoryId?: string;
    profileId?: string | null;
    title?: string;
    content?: string;
    tags?: readonly string[];
    updatedAt?: string;
  },
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.memoryApi.afterMemoryWriteInternal, {
    clerkId: args.clerkId,
    kind: args.kind,
    source: args.source,
  });
  if (
    args.kind === "delete" ||
    args.memoryId === undefined ||
    args.title === undefined ||
    args.content === undefined
  ) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.memoryEmbed.embedMemoryInternal, {
    clerkId: args.clerkId,
    memoryId: args.memoryId,
    profileId: args.profileId ?? undefined,
    text: buildSearchableText(args.title, args.content, args.tags ?? []),
  });
  if (args.updatedAt !== undefined) {
    await ctx.scheduler.runAfter(
      0,
      internal.memoryExtract.extractMemoryEntitiesInternal,
      {
        clerkId: args.clerkId,
        memoryId: args.memoryId,
        profileId: args.profileId ?? undefined,
        updatedAt: args.updatedAt,
      },
    );
  }
}

export const createMemory = authMutation({
  args: createMemoryFields,
  handler: async (ctx, args): Promise<MemoryWithTags> => {
    const created = await createMemoryForAuthedUser(ctx, args);
    await scheduleMemoryWriteFollowUp(ctx, {
      clerkId: created.userId,
      kind: "create",
      source: args.source,
      memoryId: created.id,
      profileId: created.profileId,
      title: created.title,
      content: created.content,
      tags: created.tags,
      updatedAt: created.updatedAt,
    });
    return created;
  },
});

export const getMemory = authQuery({
  args: {
    memoryId: v.string(),
    profileId: profileIdOptional,
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> =>
    getMemoryForAuthedUser(ctx, args),
});

export const listMemories = authQuery({
  args: listMemoriesFields,
  handler: async (ctx, args): Promise<MemoryListResult> =>
    listMemoriesForAuthedUser(ctx, args),
});

export const updateMemory = authMutation({
  args: updateMemoryFields,
  handler: async (ctx, args): Promise<MemoryWithTags | null> => {
    const updated = await updateMemoryForAuthedUser(ctx, args);
    if (updated) {
      const contentChanged =
        args.title !== undefined ||
        args.content !== undefined ||
        args.tags !== undefined;
      await scheduleMemoryWriteFollowUp(ctx, {
        clerkId: updated.userId,
        kind: "update",
        memoryId: updated.id,
        profileId: updated.profileId,
        title: contentChanged ? updated.title : undefined,
        content: contentChanged ? updated.content : undefined,
        tags: updated.tags,
        updatedAt: updated.updatedAt,
      });
    }
    return updated;
  },
});

export const deleteMemory = authMutation({
  args: {
    memoryId: v.string(),
    profileId: profileIdOptional,
  },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await getMemoryForAuthedUser(ctx, args);
    const deleted = await deleteMemoryForAuthedUser(ctx, args);
    if (deleted && existing) {
      await scheduleMemoryWriteFollowUp(ctx, {
        clerkId: existing.userId,
        kind: "delete",
      });
    }
    return deleted;
  },
});

export const deleteAllMemories = authAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runMutation(
      internal.memoryStore.functions.deleteMemoriesForUserInternal,
      { userId: clerkId },
    );
  },
});

export const searchMemories = authAction({
  args: searchMemoriesFields,
  handler: async (ctx, args): Promise<MemoryListResult> =>
    routeMemoryByProfile(ctx, args.profileId, {
      team: (teamProfile) =>
        runListTeamMemories(ctx, {
          profileId: teamProfile._id,
          type: args.type,
          tags: args.tags,
          source: args.source,
          searchQuery: args.query,
          limit: args.limit,
          offset: args.offset,
        }),
      personal: (clerkId) =>
        listMemoriesForClerk(ctx, {
          clerkId,
          profileId: args.profileId,
          type: args.type,
          source: args.source,
          tags: args.tags,
          searchQuery: args.query,
          limit: args.limit,
          offset: args.offset,
        }),
    }),
});

export const retrieveMemories = authAction({
  args: {
    query: v.string(),
    profileId: profileIdOptional,
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
    source: v.optional(v.string()),
    limit: v.number(),
    threshold: v.optional(v.number()),
    rerank: v.optional(v.union(v.boolean(), v.literal("jev"))),
    judge: v.optional(v.union(v.literal("jev"), v.literal("off"))),
    referenceDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RetrieveMemoriesResult> => {
    const [memories, userContext] = await Promise.all([
      routeMemoryByProfile(ctx, args.profileId, {
        team: (teamProfile, clerkId) =>
          retrieveMemoriesForTeamProfile(ctx, {
            clerkId,
            profileId: teamProfile._id,
            query: args.query,
            type: args.type,
            tags: args.tags,
            status: args.status,
            source: args.source,
            limit: args.limit,
            threshold: args.threshold,
            rerank: args.rerank,
            judge: args.judge,
            referenceDate: args.referenceDate,
          }),
        personal: (clerkId) =>
          retrieveMemoriesForClerk(ctx, {
            clerkId,
            profileId: args.profileId,
            query: args.query,
            type: args.type,
            tags: args.tags,
            status: args.status,
            source: args.source,
            limit: args.limit,
            threshold: args.threshold,
            rerank: args.rerank,
            judge: args.judge,
            referenceDate: args.referenceDate,
          }),
      }),
      ctx.runQuery(internal.userSettings.getUserContextInternal, {
        userId: ctx.userId,
      }),
    ]);
    return { memories, userContext };
  },
});
