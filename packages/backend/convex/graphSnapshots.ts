import { v } from "convex/values";
import { GRAPH_SNAPSHOT_VERSION, encodeGraphSnapshot } from "@vmem/shared";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { authAction, authQuery, requireClerkId } from "./auth";
import {
  loadScopedGraph,
  memoryGraphNodes,
  skillGraphNodes,
  type GraphNodeEntry,
  type GraphRelatesToEdge,
} from "./graphApi";
import { memoryMatchesScope } from "../engine/memory/scope";
import { toMemoryWithTags } from "./memoryStore/mappers";
import { nightlyDisabled } from "./nightly";
import { listGraphSkills } from "./skills";
import { runResolveMemoryScopeInternal } from "./teams/auth";

// Precomputed graph per viewer and profile. A build reads the whole scope
// through paged internal queries (graphApi.loadScopedGraph) and stores the
// compact body (@vmem/shared graphSnapshot.ts) in file storage, so neither the
// read limit nor the return-array limit trims it. The view merges a small
// live delta (getGraphDelta) on top. Rebuilt nightly (crons.ts), on demand
// (refreshGraphSnapshot) and on first open.

// one on-demand build per viewer and profile in this window
export const GRAPH_SNAPSHOT_REFRESH_INTERVAL_MS = 5 * 60_000;
// nightly skips a scope built in the last hour
const NIGHTLY_REBUILD_INTERVAL_MS = 60 * 60_000;
// safety caps for pathological accounts only
const MAX_SNAPSHOT_NODES = 100_000;
const MAX_SNAPSHOT_EDGES = 300_000;
// past this many changed rows the view shows the snapshot and offers a refresh
export const GRAPH_DELTA_LIMIT = 500;
// tombstones older than this are purged; older snapshots need a rebuild
export const GRAPH_TOMBSTONE_RETENTION_MS = 7 * 24 * 60 * 60_000;
const TOMBSTONE_PURGE_BATCH = 500;
const NIGHTLY_USER_PAGE = 50;
// gap between scheduled per-user nightly builds
const NIGHTLY_STAGGER_MS = 2_000;

const snapshotCountsValidator = v.object({
  memoryCount: v.number(),
  entityCount: v.number(),
  skillCount: v.number(),
  relatesCount: v.number(),
  mentionsCount: v.number(),
});

const buildResultValidator = v.object({
  byteSize: v.number(),
  buildMs: v.number(),
  truncated: v.boolean(),
  counts: snapshotCountsValidator,
});

type BuildResult = typeof buildResultValidator.type;

// 0 when a new build may start now
export function buildRetryAfterMs(
  buildStartedAt: number | undefined,
  now: number,
  minIntervalMs: number,
): number {
  if (buildStartedAt === undefined) return 0;
  return Math.max(0, buildStartedAt + minIntervalMs - now);
}

async function findSnapshotRow(
  ctx: QueryCtx,
  userId: string,
  profileId: string,
): Promise<Doc<"graphSnapshots"> | null> {
  return await ctx.db
    .query("graphSnapshots")
    .withIndex("by_user_profile", (q) =>
      q.eq("userId", userId).eq("profileId", profileId),
    )
    .unique();
}

// Marks a build as started unless one started within `minIntervalMs`.
export const claimBuildInternal = internalMutation({
  args: {
    userId: v.string(),
    profileId: v.string(),
    minIntervalMs: v.number(),
  },
  returns: v.union(
    v.object({ claimed: v.literal(true), startedAt: v.number() }),
    v.object({ claimed: v.literal(false), retryAfterMs: v.number() }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await findSnapshotRow(ctx, args.userId, args.profileId);
    const retryAfterMs = buildRetryAfterMs(
      row?.buildStartedAt,
      now,
      args.minIntervalMs,
    );
    if (retryAfterMs > 0) return { claimed: false as const, retryAfterMs };
    if (row === null) {
      await ctx.db.insert("graphSnapshots", {
        userId: args.userId,
        profileId: args.profileId,
        buildStartedAt: now,
      });
    } else {
      await ctx.db.patch(row._id, { buildStartedAt: now });
    }
    return { claimed: true as const, startedAt: now };
  },
});

// Keeps only the newest snapshot: the replaced file is deleted, and a build
// that lost a race to a newer one deletes its own file.
export const saveSnapshotInternal = internalMutation({
  args: {
    userId: v.string(),
    profileId: v.string(),
    storageId: v.id("_storage"),
    builtAt: v.number(),
    buildMs: v.number(),
    byteSize: v.number(),
    truncated: v.boolean(),
    counts: snapshotCountsValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const snapshot = {
      storageId: args.storageId,
      version: GRAPH_SNAPSHOT_VERSION,
      builtAt: args.builtAt,
      buildMs: args.buildMs,
      byteSize: args.byteSize,
      truncated: args.truncated,
      ...args.counts,
    };
    const row = await findSnapshotRow(ctx, args.userId, args.profileId);
    if (row === null) {
      await ctx.db.insert("graphSnapshots", {
        userId: args.userId,
        profileId: args.profileId,
        buildStartedAt: args.builtAt,
        snapshot,
      });
      return null;
    }
    const previous = row.snapshot;
    if (previous !== undefined && previous.builtAt > args.builtAt) {
      await ctx.storage.delete(args.storageId);
      return null;
    }
    await ctx.db.patch(row._id, { snapshot });
    if (previous !== undefined) await ctx.storage.delete(previous.storageId);
    return null;
  },
});

async function buildSnapshot(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    clerkId: string;
    profileId: string;
    startedAt: number;
  },
): Promise<BuildResult> {
  const graph = await loadScopedGraph(ctx, {
    userId: args.userId,
    clerkId: args.clerkId,
    profileId: args.profileId,
    includeSkills: true,
    maxNodes: MAX_SNAPSHOT_NODES,
    maxEdges: MAX_SNAPSHOT_EDGES,
  });
  const blob = new Blob([encodeGraphSnapshot(graph)], {
    type: "application/json",
  });
  const storageId = await ctx.storage.store(blob);
  const counts = {
    memoryCount: 0,
    entityCount: 0,
    skillCount: 0,
    relatesCount: graph.relatesToEdges.length,
    mentionsCount: graph.mentionsEdges.length,
  };
  for (const node of graph.nodes) {
    if (node.kind === "memory") counts.memoryCount += 1;
    else if (node.kind === "entity") counts.entityCount += 1;
    else counts.skillCount += 1;
  }
  const truncated =
    counts.memoryCount < graph.totalMemoryCount ||
    counts.relatesCount >= MAX_SNAPSHOT_EDGES ||
    counts.mentionsCount >= MAX_SNAPSHOT_EDGES;
  const buildMs = Date.now() - args.startedAt;
  await ctx.runMutation(internal.graphSnapshots.saveSnapshotInternal, {
    userId: args.clerkId,
    profileId: args.profileId,
    storageId,
    builtAt: args.startedAt,
    buildMs,
    byteSize: blob.size,
    truncated,
    counts,
  });
  return { byteSize: blob.size, buildMs, truncated, counts };
}

// On-demand build for the graph view (the refresh control, and first open
// when no snapshot exists). Rate limited per viewer and profile.
export const refreshGraphSnapshot = authAction({
  args: { profileId: v.string() },
  returns: v.union(
    v.object({ status: v.literal("built"), result: buildResultValidator }),
    v.object({ status: v.literal("rate_limited"), retryAfterMs: v.number() }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    | { status: "built"; result: BuildResult }
    | { status: "rate_limited"; retryAfterMs: number }
  > => {
    const clerkId = await requireClerkId(ctx);
    // throws for a profile the caller cannot read, before any row is written
    await ctx.runQuery(internal.teams.resolveMemoryScopeInternal, {
      userId: ctx.userId,
      profileId: args.profileId,
    });
    const claim = await ctx.runMutation(
      internal.graphSnapshots.claimBuildInternal,
      {
        userId: clerkId,
        profileId: args.profileId,
        minIntervalMs: GRAPH_SNAPSHOT_REFRESH_INTERVAL_MS,
      },
    );
    if (!claim.claimed) {
      return { status: "rate_limited", retryAfterMs: claim.retryAfterMs };
    }
    const result = await buildSnapshot(ctx, {
      userId: ctx.userId,
      clerkId,
      profileId: args.profileId,
      startedAt: claim.startedAt,
    });
    return { status: "built", result };
  },
});

const defaultProfileId = async (
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<string | null> => {
  const profiles = await ctx.db
    .query("profiles")
    .withIndex("by_user_default", (q) =>
      q.eq("userId", userId).eq("isDefault", true),
    )
    .take(5);
  return profiles.find((profile) => profile.teamId === undefined)?._id ?? null;
};

// the scopes a nightly or CLI build covers: every scope with a snapshot row,
// plus the default personal profile
export const listBuildScopesInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      clerkId: v.string(),
      defaultProfileId: v.union(v.string(), v.null()),
      profileIds: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const clerkId = user?.clerkId;
    if (clerkId === undefined) return null;
    const rows = await ctx.db
      .query("graphSnapshots")
      .withIndex("by_user_profile", (q) => q.eq("userId", clerkId))
      .take(100);
    const fallback = await defaultProfileId(ctx, args.userId);
    const profileIds = new Set(rows.map((row) => row.profileId));
    if (fallback !== null) profileIds.add(fallback);
    return {
      clerkId,
      defaultProfileId: fallback,
      profileIds: [...profileIds],
    };
  },
});

// CLI: `npx convex run graphSnapshots:buildForUserInternal '{"userId":"user_…"}'`
// builds one viewer's snapshot (default personal profile unless profileId is
// given), with no rate limit.
export const buildForUserInternal = internalAction({
  args: { userId: v.string(), profileId: v.optional(v.string()) },
  returns: buildResultValidator,
  handler: async (ctx, args): Promise<BuildResult> => {
    const userDocId = await ctx.runQuery(
      internal.auth.getUserIdByClerkIdInternal,
      { clerkId: args.userId },
    );
    if (userDocId === null) throw new Error("User not found");
    const scopes = await ctx.runQuery(
      internal.graphSnapshots.listBuildScopesInternal,
      { userId: userDocId },
    );
    const profileId = args.profileId ?? scopes?.defaultProfileId ?? null;
    if (profileId === null) throw new Error("User has no default profile");
    await ctx.runQuery(internal.teams.resolveMemoryScopeInternal, {
      userId: userDocId,
      profileId,
    });
    const claim = await ctx.runMutation(
      internal.graphSnapshots.claimBuildInternal,
      { userId: args.userId, profileId, minIntervalMs: 0 },
    );
    if (!claim.claimed) throw new Error("Build claim failed");
    return await buildSnapshot(ctx, {
      userId: userDocId,
      clerkId: args.userId,
      profileId,
      startedAt: claim.startedAt,
    });
  },
});

// nightly, one user: rebuilds each scope in turn; one failed scope is logged
// and does not stop the rest
export const rebuildUserInternal = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (nightlyDisabled()) return null;
    const scopes = await ctx.runQuery(
      internal.graphSnapshots.listBuildScopesInternal,
      { userId: args.userId },
    );
    if (scopes === null) return null;
    for (const profileId of scopes.profileIds) {
      try {
        const claim = await ctx.runMutation(
          internal.graphSnapshots.claimBuildInternal,
          {
            userId: scopes.clerkId,
            profileId,
            minIntervalMs: NIGHTLY_REBUILD_INTERVAL_MS,
          },
        );
        if (!claim.claimed) continue;
        await buildSnapshot(ctx, {
          userId: args.userId,
          clerkId: scopes.clerkId,
          profileId,
          startedAt: claim.startedAt,
        });
      } catch (err) {
        console.error("[graphSnapshots][nightly]", args.userId, profileId, err);
      }
    }
    return null;
  },
});

// 03:30 utc (crons.ts): pages users and schedules one staggered build per user
// with memories (NIGHTLY_DISABLED=1 stops it)
export const kickNightlyInternal = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    offsetMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (nightlyDisabled()) return null;
    const page = await ctx.db
      .query("users")
      .paginate({ numItems: NIGHTLY_USER_PAGE, cursor: args.cursor ?? null });
    let offsetMs = args.offsetMs ?? 0;
    for (const user of page.page) {
      const clerkId = user.clerkId;
      if (clerkId === undefined) continue;
      const memory = await ctx.db
        .query("memories")
        .withIndex("by_user_created", (q) => q.eq("userId", clerkId))
        .first();
      if (memory === null) continue;
      await ctx.scheduler.runAfter(
        offsetMs,
        internal.graphSnapshots.rebuildUserInternal,
        { userId: user._id },
      );
      offsetMs += NIGHTLY_STAGGER_MS;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.graphSnapshots.kickNightlyInternal,
        { cursor: page.continueCursor, offsetMs },
      );
    }
    return null;
  },
});

export const purgeExpiredTombstonesInternal = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - GRAPH_TOMBSTONE_RETENTION_MS;
    const rows = await ctx.db
      .query("memoryTombstones")
      .withIndex("by_deleted", (q) => q.lt("deletedAt", cutoff))
      .take(TOMBSTONE_PURGE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === TOMBSTONE_PURGE_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.graphSnapshots.purgeExpiredTombstonesInternal,
        {},
      );
    }
    return rows.length;
  },
});

async function viewerClerkId(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<string> {
  const user = await ctx.db.get(userId);
  if (user?.clerkId === undefined) throw new Error("User not found");
  return user.clerkId;
}

// Snapshot metadata and a download URL for the graph view. snapshot is null
// while none exists for this format version (the view builds one on open).
export const getGraphSnapshot = authQuery({
  args: { profileId: v.string() },
  handler: async (ctx, args) => {
    await runResolveMemoryScopeInternal(ctx, {
      userId: ctx.userId,
      profileId: args.profileId,
    });
    const clerkId = await viewerClerkId(ctx, ctx.userId);
    const row = await findSnapshotRow(ctx, clerkId, args.profileId);
    if (row === null) return null;
    const snapshot =
      row.snapshot?.version === GRAPH_SNAPSHOT_VERSION ? row.snapshot : null;
    const url =
      snapshot === null ? null : await ctx.storage.getUrl(snapshot.storageId);
    return {
      buildStartedAt: row.buildStartedAt,
      refreshAvailableAt:
        row.buildStartedAt + GRAPH_SNAPSHOT_REFRESH_INTERVAL_MS,
      snapshot:
        snapshot === null || url === null
          ? null
          : {
              url,
              storageId: snapshot.storageId,
              builtAt: snapshot.builtAt,
              byteSize: snapshot.byteSize,
              truncated: snapshot.truncated,
              memoryCount: snapshot.memoryCount,
            },
    };
  },
});

// What changed in scope since a snapshot was built: memories created or
// updated, links created, memories hard-deleted (memoryTombstones), and the
// current skill list (small, so sent whole). Each read is one bounded index
// range. Past GRAPH_DELTA_LIMIT rows, or for a snapshot older than the
// tombstone retention, it returns needsRefresh and no rows. Not covered until
// a rebuild: links deleted on their own, entity changes, and whole-profile or
// account deletes.
export interface GraphDeltaResult {
  needsRefresh: boolean;
  memories: GraphNodeEntry[];
  links: GraphRelatesToEdge[];
  deletedMemoryIds: string[];
  skills: GraphNodeEntry[];
}

export const getGraphDelta = authQuery({
  args: { profileId: v.string(), since: v.number() },
  handler: async (ctx, args): Promise<GraphDeltaResult> => {
    const scope = await runResolveMemoryScopeInternal(ctx, {
      userId: ctx.userId,
      profileId: args.profileId,
    });
    const empty: GraphDeltaResult = {
      needsRefresh: true,
      memories: [],
      links: [],
      deletedMemoryIds: [],
      skills: [],
    };
    if (args.since < Date.now() - GRAPH_TOMBSTONE_RETENTION_MS) return empty;

    const take = GRAPH_DELTA_LIMIT + 1;
    const readScope =
      scope.kind === "team"
        ? { kind: "team" as const, profileId: scope.profileId }
        : {
            kind: "personal" as const,
            userId: scope.clerkId,
            profileId: args.profileId,
          };
    const [memoryRows, linkRows, tombstoneRows] =
      scope.kind === "team"
        ? await Promise.all([
            ctx.db
              .query("memories")
              .withIndex("by_profile_updated", (q) =>
                q.eq("profileId", scope.profileId).gt("updatedAt", args.since),
              )
              .take(take),
            ctx.db
              .query("memoryLinks")
              .withIndex("by_profile_created", (q) =>
                q.eq("profileId", scope.profileId).gt("createdAt", args.since),
              )
              .take(take),
            ctx.db
              .query("memoryTombstones")
              .withIndex("by_profile_deleted", (q) =>
                q.eq("profileId", scope.profileId).gt("deletedAt", args.since),
              )
              .take(take),
          ])
        : await Promise.all([
            ctx.db
              .query("memories")
              .withIndex("by_user_updated", (q) =>
                q.eq("userId", scope.clerkId).gt("updatedAt", args.since),
              )
              .take(take),
            ctx.db
              .query("memoryLinks")
              .withIndex("by_user_created", (q) =>
                q.eq("userId", scope.clerkId).gt("createdAt", args.since),
              )
              .take(take),
            ctx.db
              .query("memoryTombstones")
              .withIndex("by_user_deleted", (q) =>
                q.eq("userId", scope.clerkId).gt("deletedAt", args.since),
              )
              .take(take),
          ]);
    if (
      memoryRows.length + linkRows.length + tombstoneRows.length >
      GRAPH_DELTA_LIMIT
    ) {
      return empty;
    }

    const memories = memoryRows
      .filter((row) => memoryMatchesScope(row, readScope))
      .map(toMemoryWithTags);
    const skills = await listGraphSkills(
      ctx,
      ctx.userId,
      scope.kind === "team" ? scope.teamId : undefined,
    );
    return {
      needsRefresh: false,
      memories: memoryGraphNodes(memories),
      links: linkRows.map((link) => ({
        source: link.sourceId,
        target: link.targetId,
        reason: link.reason,
      })),
      deletedMemoryIds: tombstoneRows
        .filter((row) => memoryMatchesScope(row, readScope))
        .map((row) => row.memoryId),
      skills: skillGraphNodes(skills),
    };
  },
});
