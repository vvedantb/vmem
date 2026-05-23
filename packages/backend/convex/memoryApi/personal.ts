/**
 * Personal-scope memoryApi handlers. Each `runFoo` is the body of an
 * `authAction` declared in `../memoryApi.ts`; the action's validators
 * live in the barrel so the public Convex API path
 * (`api.memoryApi.foo`) is unchanged.
 *
 * All handlers here resolve the caller's Clerk subject via
 * `requireClerkId` and (when a profileId is given) verify team
 * membership via `assertTeamAccess`. Actual work is then delegated to
 * the matching `internal.neo4jActions.memories.*` action.
 */

import { internal } from "../_generated/api";
import { requireClerkId, assertTeamAccess, type AuthActionCtx } from "./auth";
import type {
  MemoryWithTags,
  MemoryListResult,
  MemoryEvent,
  RetrieveMemoriesResult,
} from "./types";

interface CreateMemoryArgs {
  title: string;
  content: string;
  type: string;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
  profileId?: string;
  externalId?: string;
  sourceType?: string;
}

export async function runCreateMemory(
  ctx: AuthActionCtx,
  args: CreateMemoryArgs,
): Promise<MemoryWithTags> {
  const clerkId = await requireClerkId(ctx);

  // Personal profiles inherit ownership via matching userId; team
  // profiles require membership before we hit the graph.
  if (args.profileId) await assertTeamAccess(ctx, args.profileId);

  return await ctx.runAction(
    internal.neo4jActions.memories.createMemoryInternal,
    {
      clerkId,
      profileId: args.profileId,
      title: args.title,
      content: args.content,
      type: args.type,
      source: args.source,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
      url: args.url,
      externalId: args.externalId,
      sourceType: args.sourceType,
    },
  );
}

export async function runGetMemory(
  ctx: AuthActionCtx,
  args: { memoryId: string },
): Promise<MemoryWithTags | null> {
  const clerkId = await requireClerkId(ctx);
  return await ctx.runAction(internal.neo4jActions.memories.getMemoryInternal, {
    clerkId,
    memoryId: args.memoryId,
  });
}

interface ListMemoriesArgs {
  profileId?: string;
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  limit: number;
  offset: number;
}

export async function runListMemories(
  ctx: AuthActionCtx,
  args: ListMemoriesArgs,
): Promise<MemoryListResult> {
  const clerkId = await requireClerkId(ctx);
  return await ctx.runAction(
    internal.neo4jActions.memories.listMemoriesInternal,
    {
      clerkId,
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

interface UpdateMemoryArgs {
  memoryId: string;
  title?: string;
  content?: string;
  type?: string;
  status?: string;
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
}

export async function runUpdateMemory(
  ctx: AuthActionCtx,
  args: UpdateMemoryArgs,
): Promise<MemoryWithTags | null> {
  const clerkId = await requireClerkId(ctx);
  return await ctx.runAction(
    internal.neo4jActions.memories.updateMemoryInternal,
    {
      clerkId,
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

export async function runDeleteMemory(
  ctx: AuthActionCtx,
  args: { memoryId: string },
): Promise<boolean> {
  const clerkId = await requireClerkId(ctx);
  return await ctx.runAction(
    internal.neo4jActions.memories.deleteMemoryInternal,
    { clerkId, memoryId: args.memoryId },
  );
}

export async function runDeleteAllMemories(
  ctx: AuthActionCtx,
): Promise<number> {
  const clerkId = await requireClerkId(ctx);
  return await ctx.runAction(
    internal.neo4jActions.memories.deleteAllMemoriesInternal,
    { clerkId },
  );
}

interface SearchMemoriesArgs {
  query?: string;
  type?: string;
  tags?: string[];
  source?: string;
  limit: number;
  offset: number;
}

export async function runSearchMemories(
  ctx: AuthActionCtx,
  args: SearchMemoriesArgs,
): Promise<MemoryListResult> {
  const clerkId = await requireClerkId(ctx);
  return await ctx.runAction(
    internal.neo4jActions.memories.searchMemoriesInternal,
    {
      clerkId,
      query: args.query,
      type: args.type,
      tags: args.tags,
      source: args.source,
      limit: args.limit,
      offset: args.offset,
    },
  );
}

interface RetrieveMemoriesArgs {
  query: string;
  type?: string;
  tags?: string[];
  limit: number;
}

export async function runRetrieveMemories(
  ctx: AuthActionCtx,
  args: RetrieveMemoriesArgs,
): Promise<RetrieveMemoriesResult> {
  const clerkId = await requireClerkId(ctx);
  // Memories + userContext run in parallel — userContext doesn't depend
  // on the retrieval result, so the LLM caller can stitch them once both
  // resolve. Saves ~1 RTT vs sequential.
  const [memories, userContext] = await Promise.all([
    ctx.runAction(internal.neo4jActions.memories.retrieveMemoriesInternal, {
      clerkId,
      query: args.query,
      type: args.type,
      tags: args.tags,
      limit: args.limit,
    }),
    ctx.runQuery(internal.userSettings.getUserContextInternal, {
      userId: ctx.userId,
    }),
  ]);
  return { memories, userContext };
}

export async function runGetMemoryEvents(
  ctx: AuthActionCtx,
  args: { memoryId: string },
): Promise<MemoryEvent[]> {
  const clerkId = await requireClerkId(ctx);
  return await ctx.runAction(
    internal.neo4jActions.memories.getMemoryEventsInternal,
    { clerkId, memoryId: args.memoryId },
  );
}
