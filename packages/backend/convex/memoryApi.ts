import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";

// --- Return type interfaces (match MemoryService shapes) ---

interface MemoryWithTags {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string;
  source: string;
  confidence: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  tags: string[];
}

interface MemoryListResult {
  memories: MemoryWithTags[];
  total: number;
}

interface ScoreBreakdown {
  fulltext: number;
  vector: number;
  recency: number;
  confidence: number;
}

interface MemoryCandidate extends MemoryWithTags {
  trace: {
    score: number;
    scoreBreakdown: ScoreBreakdown;
    reason: string;
  };
}

interface UserContext {
  aboutMe: string | null;
  preferences: string | null;
}

interface RetrieveMemoriesResult {
  memories: MemoryCandidate[];
  userContext: UserContext;
}

interface MemorySnapshot {
  title: string;
  content: string;
  type: string;
  status: string;
  confidence: number;
  tags: string[];
}

interface MemoryEvent {
  id: string;
  action: string;
  actor: string;
  details: Record<string, string> | null;
  snapshot: MemorySnapshot | null;
  createdAt: string;
}

// --- Actions ---

export const createMemory = authAction({
  args: {
    title: v.string(),
    content: v.string(),
    type: v.string(),
    source: v.string(),
    tags: v.array(v.string()),
    confidence: v.number(),
    expiresAt: v.optional(v.string()),
    url: v.optional(v.string()),
    queueForLocalEnrichment: v.optional(v.boolean()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemoryWithTags> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");

    // Enforce access on team profiles. Personal profiles inherit ownership
    // via matching userId; team profiles require membership.
    if (args.profileId) {
      await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
        profileId: args.profileId,
        userId: ctx.userId,
      });
    }

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
        queueForLocalEnrichment: args.queueForLocalEnrichment,
      },
    );
  },
});

export const getMemory = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<MemoryWithTags | null> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.getMemoryInternal,
      {
        clerkId,
        memoryId: args.memoryId,
      },
    );
  },
});

export const listMemories = authAction({
  args: {
    profileId: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    searchQuery: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
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
  },
});

export const updateMemory = authAction({
  args: {
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
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
  },
});

export const deleteMemory = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.deleteMemoryInternal,
      {
        clerkId,
        memoryId: args.memoryId,
      },
    );
  },
});

export const searchMemories = authAction({
  args: {
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
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
  },
});

export const retrieveMemories = authAction({
  args: {
    query: v.string(),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<RetrieveMemoriesResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
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
  },
});

export const getMemoryEvents = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<MemoryEvent[]> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.getMemoryEventsInternal,
      {
        clerkId,
        memoryId: args.memoryId,
      },
    );
  },
});

export const listRecentMemoryTitlesForEnrichment = authAction({
  args: { excludeMemoryId: v.string() },
  handler: async (ctx, args): Promise<Array<{ id: string; title: string }>> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.getRecentMemoryTitlesInternal,
      {
        clerkId,
        excludeMemoryId: args.excludeMemoryId,
      },
    );
  },
});

export const applyEnrichment = authAction({
  args: {
    memoryId: v.string(),
    tags: v.array(v.string()),
    relatedMemoryIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ applied: boolean }> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.enrichment.applyEnrichmentInternal,
      {
        clerkId,
        memoryId: args.memoryId,
        tags: args.tags,
        relatedMemoryIds: args.relatedMemoryIds,
      },
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Team-scoped memory actions.
//
// These are the read/mutate entry points for the Company Knowledge UI. Each
// verifies team membership via `teams.assertProfileAccessInternal` before
// hitting Neo4j. Attribution (original creator) is preserved in `memory.userId`
// and surfaced in the UI via `users.getByClerkIds`.
// ─────────────────────────────────────────────────────────────────────────────

export const listTeamMemories = authAction({
  args: {
    profileId: v.id("profiles"),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> => {
    await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
      profileId: args.profileId,
      userId: ctx.userId,
    });
    return await ctx.runAction(
      internal.neo4jActions.memories.listMemoriesForTeamInternal,
      {
        profileId: args.profileId,
        type: args.type,
        status: args.status,
        tags: args.tags,
        limit: args.limit,
        offset: args.offset,
      },
    );
  },
});

export const getTeamMemory = authAction({
  args: {
    profileId: v.id("profiles"),
    memoryId: v.string(),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> => {
    await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
      profileId: args.profileId,
      userId: ctx.userId,
    });
    return await ctx.runAction(
      internal.neo4jActions.memories.getMemoryForTeamInternal,
      {
        profileId: args.profileId,
        memoryId: args.memoryId,
      },
    );
  },
});

export const searchTeamMemories = authAction({
  args: {
    profileId: v.id("profiles"),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> => {
    await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
      profileId: args.profileId,
      userId: ctx.userId,
    });
    return await ctx.runAction(
      internal.neo4jActions.memories.searchMemoriesForTeamInternal,
      {
        profileId: args.profileId,
        query: args.query,
        type: args.type,
        tags: args.tags,
        source: args.source,
        limit: args.limit,
        offset: args.offset,
      },
    );
  },
});

/**
 * Update a team memory. Allowed if caller is the original creator OR is a
 * team owner of the memory's team. Uses the creator-scoped Cypher path for
 * creator edits and a profile-scoped path for owner overrides.
 */
export const updateTeamMemory = authAction({
  args: {
    profileId: v.id("profiles"),
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> => {
    const callerClerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!callerClerkId) throw new Error("User not found");

    await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
      profileId: args.profileId,
      userId: ctx.userId,
    });

    // Look up the memory to find the creator clerkId (via profile-scoped read).
    const memory: MemoryWithTags | null = await ctx.runAction(
      internal.neo4jActions.memories.getMemoryForTeamInternal,
      { profileId: args.profileId, memoryId: args.memoryId },
    );
    if (!memory) throw new Error("Memory not found");

    // Authorize: creator or team owner
    await ctx.runQuery(internal.teams.assertMemoryMutablePermissionInternal, {
      userId: ctx.userId,
      memoryCreatorClerkId: memory.userId,
      profileId: args.profileId,
    });

    // Run the update scoped to the creator's clerkId so existing Cypher
    // (MATCH with userId) finds the node. This works whether caller is the
    // creator or a team owner — we've already authorized.
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
  },
});

/**
 * Delete a team memory. Creator uses the standard per-user delete path;
 * team owner override uses a profile-scoped delete (doesn't require caller
 * to be the creator).
 */
export const deleteTeamMemory = authAction({
  args: {
    profileId: v.id("profiles"),
    memoryId: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const callerClerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!callerClerkId) throw new Error("User not found");

    await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
      profileId: args.profileId,
      userId: ctx.userId,
    });

    const memory: MemoryWithTags | null = await ctx.runAction(
      internal.neo4jActions.memories.getMemoryForTeamInternal,
      { profileId: args.profileId, memoryId: args.memoryId },
    );
    if (!memory) return false;

    await ctx.runQuery(internal.teams.assertMemoryMutablePermissionInternal, {
      userId: ctx.userId,
      memoryCreatorClerkId: memory.userId,
      profileId: args.profileId,
    });

    if (memory.userId === callerClerkId) {
      // Creator delete — standard path (also logs event under caller)
      return await ctx.runAction(
        internal.neo4jActions.memories.deleteMemoryInternal,
        {
          clerkId: callerClerkId,
          memoryId: args.memoryId,
        },
      );
    }

    // Team owner override
    return await ctx.runAction(
      internal.neo4jActions.memories.deleteTeamMemoryAsOwnerInternal,
      {
        profileId: args.profileId,
        memoryId: args.memoryId,
        ownerClerkId: callerClerkId,
      },
    );
  },
});
