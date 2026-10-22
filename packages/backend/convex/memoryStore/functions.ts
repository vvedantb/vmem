import { v } from "convex/values";
import { isVisibleStatus } from "../../engine/memory/scope";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  memoryEntityTypeValidator,
  memoryListResultValidator,
  memoryStatusValidator,
  memorySummaryFilterFields,
  memorySummaryValidator,
  memoryTypeValidator,
  memoryVersionValidator,
  memoryWithTagsValidator,
} from "../validators";
import {
  collectScopedMemories,
  createMemory,
  deleteMemoriesByProfile,
  deleteMemoriesBySourceTypes,
  deleteMemoriesForUser,
  deleteMemory,
  deleteTeamMemoryAsOwner,
  getMemoriesByMemoryIds,
  getMemory,
  getMemoryForTeam,
  getMemoryHistory,
  linkMemories,
  listMemories,
  listMemoriesForTeam,
  listMemoryLinksAround,
  listMemoryLinksForUser,
  memoryReadScopeFromArgs,
  paginateMemorySummaries,
  paginateScopedDocs,
  patchMemoryEmbedding,
  reassignMemoriesProfile,
  searchMemoriesPage,
  searchMemoriesText,
  unlinkMemories,
  updateMemory,
  upsertMemoryFromSource,
  supersedeMemories,
} from "./helpers";
import { toMemoryStatRow, toMemoryWithTags } from "./mappers";
import { createOrUpsertMemory } from "./upsert";
import {
  applyLlmEntityExtraction,
  listEntitiesForGraph,
  listKnownEntities,
  listRecentMemoryCandidates,
} from "./entities";

// OR-lists and the inclusive createdAt window (epoch ms) on top of the
// single-value filters
const extraListFilterFields = {
  types: v.optional(v.array(v.string())),
  sources: v.optional(v.array(v.string())),
  createdAfter: v.optional(v.number()),
  createdBefore: v.optional(v.number()),
};

const listFilterFields = {
  type: v.optional(v.string()),
  status: v.optional(v.string()),
  source: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  searchQuery: v.optional(v.string()),
  ...extraListFilterFields,
  limit: v.number(),
  offset: v.number(),
};

const updateContentFields = {
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  type: v.optional(memoryTypeValidator),
  status: v.optional(memoryStatusValidator),
  tags: v.optional(v.array(v.string())),
  confidence: v.optional(v.number()),
  expiresAt: v.optional(v.union(v.string(), v.null())),
};

const createMemoryArgs = {
  memoryId: v.optional(v.string()),
  userId: v.string(),
  profileId: v.optional(v.string()),
  title: v.string(),
  content: v.string(),
  type: memoryTypeValidator,
  source: v.string(),
  tags: v.array(v.string()),
  confidence: v.number(),
  contentHash: v.optional(v.string()),
  status: v.optional(memoryStatusValidator),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  expiresAt: v.optional(v.string()),
  url: v.optional(v.string()),
  sourceType: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  sourceSyncedAt: v.optional(v.string()),
  storageId: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  originalFilename: v.optional(v.string()),
  eventStart: v.optional(v.union(v.string(), v.null())),
  eventEnd: v.optional(v.union(v.string(), v.null())),
  temporalKind: v.optional(
    v.union(
      v.literal("event"),
      v.literal("state"),
      v.literal("plan"),
      v.literal("preference"),
      v.null(),
    ),
  ),
  skipHashDedupe: v.optional(v.boolean()),
};

export const createMemoryInternal = internalMutation({
  args: createMemoryArgs,
  returns: memoryWithTagsValidator,
  handler: async (ctx, args) => createMemory(ctx, args),
});

const { sourceId: _sourceId, ...createOrUpsertBaseArgs } = createMemoryArgs;

export const createOrUpsertResultValidator = v.object({
  memory: memoryWithTagsValidator,
  needsFollowUp: v.boolean(),
});

export const createOrUpsertMemoryInternal = internalMutation({
  args: { ...createOrUpsertBaseArgs, externalId: v.optional(v.string()) },
  returns: createOrUpsertResultValidator,
  handler: async (ctx, args) => createOrUpsertMemory(ctx, args),
});

export const getMemoryInternal = internalQuery({
  args: {
    userId: v.string(),
    memoryId: v.string(),
  },
  returns: v.union(memoryWithTagsValidator, v.null()),
  handler: async (ctx, args) => getMemory(ctx, args.userId, args.memoryId),
});

export const getMemoryForTeamInternal = internalQuery({
  args: {
    profileId: v.string(),
    memoryId: v.string(),
  },
  returns: v.union(memoryWithTagsValidator, v.null()),
  handler: async (ctx, args) =>
    getMemoryForTeam(ctx, args.profileId, args.memoryId),
});

// prior versions newest first; null when the memory is outside the scope
export const getMemoryHistoryInternal = internalQuery({
  args: {
    kind: v.union(v.literal("personal"), v.literal("team")),
    userId: v.optional(v.string()),
    profileId: v.optional(v.string()),
    memoryId: v.string(),
  },
  returns: v.union(v.array(memoryVersionValidator), v.null()),
  handler: async (ctx, args) => {
    const scope = memoryReadScopeFromArgs(args);
    if (scope === null) return null;
    return getMemoryHistory(ctx, scope, args.memoryId);
  },
});

export const listMemoriesInternal = internalQuery({
  args: {
    userId: v.string(),
    profileId: v.optional(v.union(v.string(), v.null())),
    ...listFilterFields,
  },
  returns: memoryListResultValidator,
  handler: async (ctx, args) =>
    listMemories(ctx, args.userId, {
      profileId: args.profileId,
      type: args.type,
      types: args.types,
      status: args.status,
      source: args.source,
      sources: args.sources,
      tags: args.tags,
      searchQuery: args.searchQuery,
      createdAfter: args.createdAfter,
      createdBefore: args.createdBefore,
      limit: args.limit,
      offset: args.offset,
    }),
});

export const listMemoriesForTeamInternal = internalQuery({
  args: {
    profileId: v.string(),
    ...listFilterFields,
  },
  returns: memoryListResultValidator,
  handler: async (ctx, args) =>
    listMemoriesForTeam(ctx, args.profileId, {
      type: args.type,
      types: args.types,
      status: args.status,
      source: args.source,
      sources: args.sources,
      tags: args.tags,
      searchQuery: args.searchQuery,
      createdAfter: args.createdAfter,
      createdBefore: args.createdBefore,
      limit: args.limit,
      offset: args.offset,
    }),
});

export const collectScopedMemoriesInternal = internalQuery({
  args: {
    kind: v.union(v.literal("personal"), v.literal("team")),
    userId: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  returns: v.array(memoryWithTagsValidator),
  handler: async (ctx, args) => {
    const scope = memoryReadScopeFromArgs(args);
    if (scope === null) return [];
    return collectScopedMemories(ctx, scope);
  },
});

const scopedPageArgs = {
  kind: v.union(v.literal("personal"), v.literal("team")),
  userId: v.optional(v.string()),
  profileId: v.optional(v.string()),
  cursor: v.union(v.string(), v.null()),
  numItems: v.number(),
};

const scopedPageMeta = {
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(
      v.null(),
      v.literal("SplitRecommended"),
      v.literal("SplitRequired"),
    ),
  ),
};

function emptyScopedPage(cursor: string | null) {
  return {
    isDone: true,
    continueCursor: cursor ?? "",
  };
}

export const paginateScopedMemoriesInternal = internalQuery({
  args: scopedPageArgs,
  returns: v.object({
    memories: v.array(memoryWithTagsValidator),
    ...scopedPageMeta,
  }),
  handler: async (ctx, args) => {
    const scope = memoryReadScopeFromArgs(args);
    if (scope === null) {
      return { memories: [], ...emptyScopedPage(args.cursor) };
    }
    const page = await paginateScopedDocs(ctx, scope, {
      numItems: args.numItems,
      cursor: args.cursor,
    });
    return {
      memories: page.page.map(toMemoryWithTags),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      splitCursor: page.splitCursor,
      pageStatus: page.pageStatus,
    };
  },
});

// slim rows for non-reactive full-scope walks (facets, timeline)
export const paginateScopedMemorySummariesInternal = internalQuery({
  args: { ...scopedPageArgs, ...memorySummaryFilterFields },
  returns: v.object({
    rows: v.array(memorySummaryValidator),
    ...scopedPageMeta,
  }),
  handler: async (ctx, args) => {
    const scope = memoryReadScopeFromArgs(args);
    if (scope === null) return { rows: [], ...emptyScopedPage(args.cursor) };
    const page = await paginateMemorySummaries(
      ctx,
      scope,
      { numItems: args.numItems, cursor: args.cursor },
      {
        type: args.type,
        source: args.source,
        tags: args.tags,
        searchQuery: args.searchQuery,
      },
    );
    return {
      rows: page.page,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      splitCursor: page.splitCursor,
      pageStatus: page.pageStatus,
    };
  },
});

export const paginateScopedMemoryStatsInternal = internalQuery({
  args: scopedPageArgs,
  returns: v.object({
    rows: v.array(
      v.object({
        createdAt: v.number(),
        tags: v.array(v.string()),
      }),
    ),
    ...scopedPageMeta,
  }),
  handler: async (ctx, args) => {
    const scope = memoryReadScopeFromArgs(args);
    if (scope === null) {
      return { rows: [], ...emptyScopedPage(args.cursor) };
    }
    const page = await paginateScopedDocs(ctx, scope, {
      numItems: args.numItems,
      cursor: args.cursor,
    });
    // counts visible rows only, like the counters; the cursor still walks all
    return {
      rows: page.page
        .filter((doc) => isVisibleStatus(doc.status))
        .map(toMemoryStatRow),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      splitCursor: page.splitCursor,
      pageStatus: page.pageStatus,
    };
  },
});

export const updateMemoryInternal = internalMutation({
  args: {
    userId: v.string(),
    memoryId: v.string(),
    ...updateContentFields,
  },
  returns: v.union(memoryWithTagsValidator, v.null()),
  handler: async (ctx, args) =>
    updateMemory(ctx, args.userId, args.memoryId, {
      title: args.title,
      content: args.content,
      type: args.type,
      status: args.status,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
    }),
});

const memoryScopeFields = {
  kind: v.union(v.literal("personal"), v.literal("team")),
  userId: v.optional(v.string()),
  profileId: v.optional(v.string()),
};

export const supersedeMemoriesInternal = internalMutation({
  args: {
    ...memoryScopeFields,
    predecessorIds: v.array(v.string()),
    successorId: v.optional(v.string()),
    reason: v.optional(v.string()),
    asVersion: v.optional(v.boolean()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (args.kind === "team") {
      if (args.profileId === undefined) return 0;
      return supersedeMemories(ctx, {
        scope: { kind: "team", profileId: args.profileId },
        predecessorIds: args.predecessorIds,
        successorId: args.successorId,
        reason: args.reason,
        asVersion: args.asVersion,
      });
    }
    if (args.userId === undefined) return 0;
    return supersedeMemories(ctx, {
      scope: {
        kind: "personal",
        userId: args.userId,
        profileId: args.profileId,
      },
      predecessorIds: args.predecessorIds,
      successorId: args.successorId,
      reason: args.reason,
      asVersion: args.asVersion,
    });
  },
});

export const deleteMemoryInternal = internalMutation({
  args: {
    userId: v.string(),
    memoryId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => deleteMemory(ctx, args.userId, args.memoryId),
});

export const deleteTeamMemoryAsOwnerInternal = internalMutation({
  args: {
    profileId: v.string(),
    memoryId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    deleteTeamMemoryAsOwner(ctx, args.profileId, args.memoryId),
});

export const deleteMemoriesForUserInternal = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => deleteMemoriesForUser(ctx, args.userId),
});

export const deleteMemoriesByProfileInternal = internalMutation({
  args: { profileId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => deleteMemoriesByProfile(ctx, args.profileId),
});

export const reassignMemoriesProfileInternal = internalMutation({
  args: {
    fromProfileId: v.string(),
    toProfileId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) =>
    reassignMemoriesProfile(ctx, args.fromProfileId, args.toProfileId),
});

export const deleteMemoriesBySourceTypesInternal = internalMutation({
  args: {
    userId: v.string(),
    sourceTypes: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) =>
    deleteMemoriesBySourceTypes(ctx, args.userId, args.sourceTypes),
});

// connectors pass only the source fields; caller creates with an externalId
// go through createOrUpsertMemory (visibleOnly)
export const upsertMemoryFromSourceInternal = internalMutation({
  args: {
    ...createMemoryArgs,
    profileId: v.string(),
    type: v.optional(memoryTypeValidator),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    sourceType: v.string(),
    sourceId: v.string(),
    visibleOnly: v.optional(v.boolean()),
  },
  returns: v.object({
    memory: memoryWithTagsValidator,
    created: v.boolean(),
    contentChanged: v.boolean(),
  }),
  handler: async (ctx, args) =>
    upsertMemoryFromSource(ctx, {
      ...args,
      type: args.type ?? "knowledge",
      source: args.source ?? args.sourceType,
      tags: args.tags ?? [],
      confidence: args.confidence ?? 1,
    }),
});

export const searchMemoriesTextInternal = internalQuery({
  args: {
    kind: v.union(v.literal("personal"), v.literal("team")),
    userId: v.optional(v.string()),
    profileId: v.optional(v.string()),
    query: v.string(),
    type: v.optional(v.string()),
    source: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.array(
    v.object({
      memory: memoryWithTagsValidator,
      rank: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const filter = {
      type: args.type,
      source: args.source,
      status: args.status,
      tags: args.tags,
    };
    if (args.kind === "team") {
      if (args.profileId === undefined) return [];
      return searchMemoriesText(
        ctx,
        { kind: "team", profileId: args.profileId },
        args.query,
        { filter },
      );
    }
    if (args.userId === undefined) return [];
    return searchMemoriesText(
      ctx,
      {
        kind: "personal",
        userId: args.userId,
        profileId: args.profileId,
      },
      args.query,
      { filter },
    );
  },
});

export const searchMemoriesPageInternal = internalQuery({
  args: {
    kind: v.union(v.literal("personal"), v.literal("team")),
    userId: v.optional(v.string()),
    profileId: v.optional(v.string()),
    search: v.string(),
    requireTerms: v.optional(v.string()),
    type: v.optional(v.string()),
    source: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    ...extraListFilterFields,
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    memories: v.array(memoryWithTagsValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
    scanned: v.number(),
  }),
  handler: async (ctx, args) => {
    const scope = memoryReadScopeFromArgs(args);
    if (scope === null) {
      return { memories: [], continueCursor: "", isDone: true, scanned: 0 };
    }
    return await searchMemoriesPage(ctx, scope, {
      search: args.search,
      requireTerms: args.requireTerms,
      filter: {
        type: args.type,
        types: args.types,
        source: args.source,
        sources: args.sources,
        status: args.status,
        tags: args.tags,
        createdAfter: args.createdAfter,
        createdBefore: args.createdBefore,
      },
      numItems: args.numItems,
      cursor: args.cursor,
    });
  },
});

export const getMemoriesByEmbeddingIdsInternal = internalQuery({
  args: { ids: v.array(v.id("memoryEmbeddings")) },
  returns: v.array(v.union(memoryWithTagsValidator, v.null())),
  handler: async (ctx, args) => {
    const out: Array<ReturnType<typeof toMemoryWithTags> | null> = [];
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      const doc = row ? await ctx.db.get(row.memoryDocId) : null;
      out.push(doc ? toMemoryWithTags(doc) : null);
    }
    return out;
  },
});

export const getMemoriesByMemoryIdsInternal = internalQuery({
  args: { ids: v.array(v.string()) },
  returns: v.array(v.union(memoryWithTagsValidator, v.null())),
  handler: async (ctx, args) => getMemoriesByMemoryIds(ctx, args.ids),
});

export const patchMemoryEmbeddingInternal = internalMutation({
  args: {
    memoryId: v.string(),
    embedding: v.array(v.float64()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    patchMemoryEmbedding(ctx, args.memoryId, args.embedding),
});

const memoryLinkEdgeValidator = v.object({
  sourceId: v.string(),
  targetId: v.string(),
  reason: v.string(),
});

export const linkMemoriesInternal = internalMutation({
  args: {
    userId: v.string(),
    profileId: v.optional(v.string()),
    memoryIdA: v.string(),
    memoryIdB: v.string(),
    reason: v.string(),
    origin: v.optional(
      v.union(v.literal("manual"), v.literal("entity"), v.literal("extract")),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => linkMemories(ctx, args),
});

export const unlinkMemoriesInternal = internalMutation({
  args: {
    userId: v.string(),
    profileId: v.optional(v.string()),
    memoryIdA: v.string(),
    memoryIdB: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => unlinkMemories(ctx, args),
});

export const listMemoryLinksForUserInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.array(memoryLinkEdgeValidator),
  handler: async (ctx, args) => listMemoryLinksForUser(ctx, args.userId),
});

export const listMemoryLinksAroundInternal = internalQuery({
  args: {
    userId: v.string(),
    seedIds: v.array(v.string()),
    hops: v.number(),
    perNode: v.optional(v.number()),
    maxEdges: v.optional(v.number()),
  },
  returns: v.array(memoryLinkEdgeValidator),
  handler: async (ctx, args) => listMemoryLinksAround(ctx, args),
});

const extractedEntityValidator = v.object({
  name: v.string(),
  normalizedName: v.string(),
  type: memoryEntityTypeValidator,
  match: v.union(v.literal("token"), v.literal("team"), v.literal("project")),
});

const knownEntityValidator = v.object({
  name: v.string(),
  normalizedName: v.string(),
  type: v.string(),
});

const recentCandidateValidator = v.object({
  id: v.string(),
  title: v.string(),
  tags: v.array(v.string()),
});

export const listKnownEntitiesInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.array(knownEntityValidator),
  handler: async (ctx, args) => listKnownEntities(ctx, args.userId),
});

export const listRecentMemoryCandidatesInternal = internalQuery({
  args: {
    userId: v.string(),
    profileId: v.optional(v.string()),
    excludeMemoryId: v.string(),
  },
  returns: v.array(recentCandidateValidator),
  handler: async (ctx, args) =>
    listRecentMemoryCandidates(
      ctx,
      args.userId,
      args.profileId,
      args.excludeMemoryId,
    ),
});

export const applyLlmEntityExtractionInternal = internalMutation({
  args: {
    userId: v.string(),
    memoryId: v.string(),
    entities: v.array(extractedEntityValidator),
    relatedMemoryIds: v.array(v.string()),
    candidates: v.optional(v.array(recentCandidateValidator)),
    knownEntities: v.optional(v.array(knownEntityValidator)),
  },
  returns: v.number(),
  handler: async (ctx, args) => applyLlmEntityExtraction(ctx, args),
});

export const listEntitiesForGraphInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    nodes: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        normalizedName: v.string(),
        type: v.string(),
        createdAt: v.number(),
      }),
    ),
    mentions: v.array(
      v.object({
        memoryId: v.string(),
        entityId: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => listEntitiesForGraph(ctx, args.userId),
});
