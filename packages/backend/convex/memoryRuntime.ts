import type { MemoryCandidate, MemoryType, MemoryWithTags } from "@vmem/sdk";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { MemoryListResult } from "./memoryApi/types";
import { resolveProfileIdForClerkId } from "./memoryScope";
import {
  toMemoryStatusOrUndefined,
  toMemoryTypeOrUndefined,
} from "../engine/memory/parse";
import {
  summarizeRetrievedMemories,
  toMemoryCandidate,
} from "../engine/memory/retrieve";
import { scheduleContextPromptInvalidationByClerkId } from "./lib/contextPromptInvalidate";

type MemoryCtx = Pick<ActionCtx, "runQuery" | "runMutation" | "scheduler">;

export const toMemoryType = toMemoryTypeOrUndefined;
export const toMemoryStatus = toMemoryStatusOrUndefined;
export { toMemoryCandidate, summarizeRetrievedMemories };

export interface CreateMemoryRuntimeArgs {
  clerkId: string;
  profileId?: string;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
  externalId?: string;
  sourceType?: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
}

export interface ListMemoryRuntimeArgs {
  clerkId: string;
  profileId?: string;
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  limit: number;
  offset: number;
}

export interface UpdateMemoryRuntimeArgs {
  clerkId: string;
  memoryId: string;
  title?: string;
  content?: string;
  type?: MemoryType;
  status?: ReturnType<typeof toMemoryStatus>;
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
}

export async function createMemoryForClerk(
  ctx: MemoryCtx,
  args: CreateMemoryRuntimeArgs,
): Promise<MemoryWithTags> {
  const profileId = await resolveProfileIdForClerkId(
    ctx,
    args.clerkId,
    args.profileId,
  );
  const created = await ctx.runMutation(
    internal.memoryStore.functions.createMemoryInternal,
    {
      userId: args.clerkId,
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
      storageId: args.storageId,
      mimeType: args.mimeType,
      originalFilename: args.originalFilename,
    },
  );
  await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
  return created;
}

export async function listMemoriesForClerk(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: ListMemoryRuntimeArgs,
): Promise<MemoryListResult> {
  const profileId = await resolveProfileIdForClerkId(
    ctx,
    args.clerkId,
    args.profileId,
  );
  return await ctx.runQuery(
    internal.memoryStore.functions.listMemoriesInternal,
    {
      userId: args.clerkId,
      profileId,
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

export async function listMemoriesForTeamProfile(
  ctx: Pick<ActionCtx, "runQuery">,
  args: Omit<ListMemoryRuntimeArgs, "clerkId"> & { profileId: string },
): Promise<MemoryListResult> {
  return await ctx.runQuery(
    internal.memoryStore.functions.listMemoriesForTeamInternal,
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

export async function getMemoryForClerk(
  ctx: Pick<ActionCtx, "runQuery">,
  clerkId: string,
  memoryId: string,
): Promise<MemoryWithTags | null> {
  return await ctx.runQuery(internal.memoryStore.functions.getMemoryInternal, {
    userId: clerkId,
    memoryId,
  });
}

export async function updateMemoryForClerk(
  ctx: MemoryCtx,
  args: UpdateMemoryRuntimeArgs,
): Promise<MemoryWithTags | null> {
  const updated = await ctx.runMutation(
    internal.memoryStore.functions.updateMemoryInternal,
    {
      userId: args.clerkId,
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
  if (updated) {
    await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
  }
  return updated;
}

export async function deleteMemoryForClerk(
  ctx: MemoryCtx,
  clerkId: string,
  memoryId: string,
): Promise<boolean> {
  const deleted = await ctx.runMutation(
    internal.memoryStore.functions.deleteMemoryInternal,
    { userId: clerkId, memoryId },
  );
  if (deleted) {
    await scheduleContextPromptInvalidationByClerkId(ctx, clerkId);
  }
  return deleted;
}

export async function retrieveMemoriesForClerk(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    clerkId: string;
    profileId?: string;
    query: string;
    type?: string;
    tags?: string[];
    limit: number;
  },
): Promise<MemoryCandidate[]> {
  const listed = await listMemoriesForClerk(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    type: args.type,
    tags: args.tags,
    searchQuery: args.query,
    limit: args.limit,
    offset: 0,
  });
  return listed.memories.map((memory) => toMemoryCandidate(memory, args.query));
}

export async function retrieveMemoriesForTeamProfile(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    profileId: string;
    query: string;
    type?: string;
    tags?: string[];
    limit: number;
  },
): Promise<MemoryCandidate[]> {
  const listed = await listMemoriesForTeamProfile(ctx, {
    profileId: args.profileId,
    type: args.type,
    tags: args.tags,
    searchQuery: args.query,
    limit: args.limit,
    offset: 0,
  });
  return listed.memories.map((memory) => toMemoryCandidate(memory, args.query));
}

export async function storeMemoryFromInstruction(
  ctx: MemoryCtx,
  args: { clerkId: string; instruction: string; profileId?: string },
): Promise<{ created: MemoryWithTags[]; summary: string }> {
  const instruction = args.instruction.trim();
  const created = await createMemoryForClerk(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    title: instruction.slice(0, 80) || "Instruction",
    content: instruction,
    type: "knowledge",
    source: "instruction",
    tags: ["instruction"],
    confidence: 0.9,
    sourceType: "instruction",
  });
  return {
    created: [created],
    summary: "Stored 1 memory from instruction.",
  };
}
