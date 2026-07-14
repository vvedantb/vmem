import { internal } from "../_generated/api";
import { requireClerkId, type AuthActionCtx } from "../auth";
import { assertTeamAccess } from "./auth";
import { routeMemoryByProfile } from "./routing";
import {
  runDeleteTeamMemory,
  runGetTeamMemory,
  runListTeamMemories,
  runSearchTeamMemories,
  runUpdateTeamMemory,
} from "./team";
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
  args: { memoryId: string; profileId?: string },
): Promise<MemoryWithTags | null> {
  return routeMemoryByProfile(ctx, args.profileId, {
    team: (teamProfile) =>
      runGetTeamMemory(ctx, {
        profileId: teamProfile._id,
        memoryId: args.memoryId,
      }),
    personal: (clerkId) =>
      ctx.runAction(internal.neo4jActions.memories.getMemoryInternal, {
        clerkId,
        memoryId: args.memoryId,
      }),
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
  return routeMemoryByProfile(ctx, args.profileId, {
    team: async (teamProfile) => {
      // Team workspace: member-wide listing. Free-text / source filters map
      // onto the team search variant (the team list path has no
      // searchQuery/source support of its own).
      if (args.searchQuery !== undefined || args.source !== undefined) {
        return runSearchTeamMemories(ctx, {
          profileId: teamProfile._id,
          query: args.searchQuery,
          type: args.type,
          tags: args.tags,
          source: args.source,
          limit: args.limit,
          offset: args.offset,
        });
      }
      return runListTeamMemories(ctx, {
        profileId: teamProfile._id,
        type: args.type,
        status: args.status,
        tags: args.tags,
        limit: args.limit,
        offset: args.offset,
      });
    },
    personal: (clerkId) =>
      ctx.runAction(internal.neo4jActions.memories.listMemoriesInternal, {
        clerkId,
        profileId: args.profileId,
        type: args.type,
        status: args.status,
        source: args.source,
        tags: args.tags,
        searchQuery: args.searchQuery,
        limit: args.limit,
        offset: args.offset,
      }),
  });
}

interface UpdateMemoryArgs {
  memoryId: string;
  profileId?: string;
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
  return routeMemoryByProfile(ctx, args.profileId, {
    team: (teamProfile) =>
      runUpdateTeamMemory(ctx, {
        profileId: teamProfile._id,
        memoryId: args.memoryId,
        title: args.title,
        content: args.content,
        type: args.type,
        status: args.status,
        tags: args.tags,
        confidence: args.confidence,
        expiresAt: args.expiresAt,
      }),
    personal: (clerkId) =>
      ctx.runAction(internal.neo4jActions.memories.updateMemoryInternal, {
        clerkId,
        memoryId: args.memoryId,
        title: args.title,
        content: args.content,
        type: args.type,
        status: args.status,
        tags: args.tags,
        confidence: args.confidence,
        expiresAt: args.expiresAt,
      }),
  });
}

export async function runDeleteMemory(
  ctx: AuthActionCtx,
  args: { memoryId: string; profileId?: string },
): Promise<boolean> {
  return routeMemoryByProfile(ctx, args.profileId, {
    team: (teamProfile) =>
      runDeleteTeamMemory(ctx, {
        profileId: teamProfile._id,
        memoryId: args.memoryId,
      }),
    personal: (clerkId) =>
      ctx.runAction(internal.neo4jActions.memories.deleteMemoryInternal, {
        clerkId,
        memoryId: args.memoryId,
      }),
  });
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
  profileId?: string;
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
  return routeMemoryByProfile(ctx, args.profileId, {
    team: (teamProfile) =>
      runSearchTeamMemories(ctx, {
        profileId: teamProfile._id,
        query: args.query,
        type: args.type,
        tags: args.tags,
        source: args.source,
        limit: args.limit,
        offset: args.offset,
      }),
    personal: (clerkId) =>
      ctx.runAction(internal.neo4jActions.memories.searchMemoriesInternal, {
        clerkId,
        profileId: args.profileId,
        query: args.query,
        type: args.type,
        tags: args.tags,
        source: args.source,
        limit: args.limit,
        offset: args.offset,
      }),
  });
}

interface RetrieveMemoriesArgs {
  query: string;
  profileId?: string;
  type?: string;
  tags?: string[];
  limit: number;
}

export async function runRetrieveMemories(
  ctx: AuthActionCtx,
  args: RetrieveMemoriesArgs,
): Promise<RetrieveMemoriesResult> {
  const clerkId = await requireClerkId(ctx);
  // Workspace grounding: assert access before scoping retrieval. Team
  // profiles currently retrieve only the caller's own memories in that
  // profile (hybrid retrieval is per-user) — member-wide team retrieval is
  // a follow-up.
  if (args.profileId) await assertTeamAccess(ctx, args.profileId);
  // Memories + userContext run in parallel — userContext doesn't depend
  // on the retrieval result, so the LLM caller can stitch them once both
  // resolve. Saves ~1 RTT vs sequential.
  const [memories, userContext] = await Promise.all([
    ctx.runAction(internal.neo4jActions.memories.retrieveMemoriesInternal, {
      clerkId,
      profileId: args.profileId,
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
