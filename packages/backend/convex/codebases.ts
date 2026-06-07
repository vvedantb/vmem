import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { authAction, authMutation, authQuery, requireClerkId } from "./auth";
import { DAILY_SYNC_STALE_MS, STALE_SYNCING_MS } from "./codebaseSyncConstants";
import type { Id } from "./_generated/dataModel";
import { decryptToken } from "./lib/crypto";
import { retrier } from "./retrier";

// --- GitHub API response shape for repos ---

type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  language: string | null;
  description: string | null;
  private: boolean;
};

// --- Public functions ---

export const listMy = authQuery({
  args: {},
  handler: async (ctx) => {
    const codebases = await ctx.db
      .query("codebases")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    // Batch-resolve avatar URLs from GitHub connections
    const connectionCache = new Map<string, string | undefined>();
    return Promise.all(
      codebases.map(async (cb) => {
        const connId = cb.githubConnectionId.toString();
        if (!connectionCache.has(connId)) {
          const conn = await ctx.db.get(cb.githubConnectionId);
          connectionCache.set(connId, conn?.avatarUrl);
        }
        return { ...cb, avatarUrl: connectionCache.get(connId) };
      }),
    );
  },
});

export const getById = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    // Convex normalizes string → Id at runtime via ctx.db.get
    const codebase = await ctx.db.normalizeId("codebases", args.id);
    if (!codebase) return null;
    const doc = await ctx.db.get(codebase);
    if (!doc || doc.userId !== ctx.userId) return null;
    return doc;
  },
});

export const listRepos = authAction({
  args: {},
  handler: async (ctx) => {
    const encryptedToken = await ctx.runQuery(
      internal.github.getDecryptedTokenInternal,
      { userId: ctx.userId },
    );
    if (!encryptedToken) throw new Error("GitHub not connected");

    const token = await decryptToken(encryptedToken);

    const response = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&type=all",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${text}`);
    }

    // response.json() returns Promise<any> in the standard lib.
    // Annotating the variable directly avoids using `as`.
    const repos: Array<GitHubRepo> = await response.json();

    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      defaultBranch: repo.default_branch,
      language: repo.language,
      description: repo.description,
      isPrivate: repo.private,
    }));
  },
});

export const addCodebase = authMutation({
  args: {
    githubConnectionId: v.id("githubConnections"),
    repoOwner: v.string(),
    repoName: v.string(),
    repoFullName: v.string(),
    defaultBranch: v.string(),
    language: v.optional(v.string()),
    description: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate
    const existing = await ctx.db
      .query("codebases")
      .withIndex("by_user_repo", (q) =>
        q.eq("userId", ctx.userId).eq("repoFullName", args.repoFullName),
      )
      .first();
    if (existing) throw new Error("Repository already added");

    return await ctx.db.insert("codebases", {
      userId: ctx.userId,
      githubConnectionId: args.githubConnectionId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      repoFullName: args.repoFullName,
      defaultBranch: args.defaultBranch,
      language: args.language,
      description: args.description,
      isPrivate: args.isPrivate,
      status: "pending",
      totalFiles: 0,
      syncedFiles: 0,
    });
  },
});

export const removeCodebase = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("codebases", args.id);
    if (!normalizedId) throw new Error("Invalid codebase id");
    const codebase = await ctx.db.get(normalizedId);
    if (!codebase || codebase.userId !== ctx.userId) {
      throw new Error("Codebase not found");
    }
    // Delete the Convex row immediately (keeps the optimistic update snappy)
    // and schedule Neo4j cleanup. The graph data is scoped by clerkId, so we
    // resolve it before handing off to the Node-runtime delete action.
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: ctx.userId,
    });
    await ctx.db.delete(normalizedId);
    if (clerkId) {
      // Retried (not plain scheduled) so a transient Neo4j outage can't leave
      // orphaned graph nodes behind after the row is already gone. The delete
      // is idempotent — re-running it on already-deleted nodes is a no-op.
      await retrier.run(
        ctx,
        internal.neo4jActions.codebases.deleteCodebaseInternal,
        { clerkId, codebaseId: normalizedId },
      );
    }
  },
});

/**
 * Archive or unarchive a codebase. Archived codebases retain all their data
 * but are skipped by the scheduled daily sync and hidden from the main
 * sidebar list (surfaced in a collapsed "Archived" accordion instead).
 */
export const setArchived = authMutation({
  args: { id: v.string(), archived: v.boolean() },
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("codebases", args.id);
    if (!normalizedId) throw new Error("Invalid codebase id");
    const codebase = await ctx.db.get(normalizedId);
    if (!codebase || codebase.userId !== ctx.userId) {
      throw new Error("Codebase not found");
    }
    await ctx.db.patch(normalizedId, { isArchived: args.archived });
  },
});

export const syncCodebase = authAction({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalizedId = await ctx.runQuery(
      internal.codebases.normalizeCodebaseId,
      { id: args.id },
    );
    if (!normalizedId) throw new Error("Invalid codebase id");

    const codebase = await ctx.runQuery(internal.codebases.getByIdInternal, {
      id: normalizedId,
      userId: ctx.userId,
    });
    if (!codebase) throw new Error("Codebase not found");

    const result = await ctx.runAction(
      internal.codebaseSyncActions.syncOneCodebaseInternal,
      { codebaseId: normalizedId },
    );
    if (!result.ok) {
      throw new Error(result.message || "Codebase sync failed");
    }
  },
});

/**
 * Re-sync every codebase belonging to the current user. Fires when the
 * user clicks the "Re-sync" banner that appears on `/codebases` after a
 * `PARSER_VERSION` bump. We run them sequentially to avoid hammering
 * GitHub rate limits.
 */
export const syncAllMy = authAction({
  args: {},
  handler: async (ctx) => {
    // Explicit type breaks the circular inference caused by re-entering
    // `api.codebases.syncCodebase` below (this action references itself).
    const allCodebases: Array<{ _id: string; isArchived?: boolean }> =
      await ctx.runQuery(internal.codebases.listMyInternal, {
        userId: ctx.userId,
      });
    // Archived codebases are intentionally excluded from re-syncs.
    const codebases = allCodebases.filter((cb) => !cb.isArchived);
    for (const cb of codebases) {
      try {
        // Re-entering the public sync action keeps all the auth/token
        // wiring centralised — no need to duplicate it here.
        await ctx.runAction(api.codebases.syncCodebase, { id: cb._id });
      } catch (err) {
        // Per-codebase errors are already recorded on the row by syncCodebase;
        // continue to the next one rather than aborting the whole batch.
        console.error("syncAllMy: codebase failed", cb._id, err);
      }
    }
    return { synced: codebases.length };
  },
});

interface CodeFileNode {
  id: string;
  path: string;
  directory: string;
  filename: string;
  extension: string;
  sizeBytes: number;
}

interface ImportEdge {
  source: string;
  target: string;
  importPath: string;
}

interface CodebaseGraphResult {
  nodes: CodeFileNode[];
  edges: ImportEdge[];
}

export const getCodebaseGraph = authAction({
  args: { codebaseId: v.string() },
  handler: async (ctx, args): Promise<CodebaseGraphResult> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.codebases.getCodebaseGraphInternal,
      {
        clerkId,
        codebaseId: args.codebaseId,
      },
    );
  },
});

// --- Internal helpers ---

/** Normalize a string id to a typed Id<"codebases"> for use in internal functions. */
export const normalizeCodebaseId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.normalizeId("codebases", args.id);
  },
});

export const getByIdInternal = internalQuery({
  args: { id: v.id("codebases"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const codebase = await ctx.db.get(args.id);
    if (!codebase || codebase.userId !== args.userId) return null;
    return codebase;
  },
});

export const updateStatusInternal = internalMutation({
  args: {
    id: v.id("codebases"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("syncing"),
        v.literal("synced"),
        v.literal("error"),
      ),
    ),
    totalFiles: v.optional(v.number()),
    totalEdges: v.optional(v.number()),
    syncedFiles: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    // Phase 1 stats — present only on the final "synced" patch.
    functionCount: v.optional(v.number()),
    classCount: v.optional(v.number()),
    interfaceCount: v.optional(v.number()),
    callEdgeCount: v.optional(v.number()),
    processCount: v.optional(v.number()),
    parserVersion: v.optional(v.string()),
    lastParseError: v.optional(v.string()),
    parseStage: v.optional(
      v.union(
        v.literal("fetching"),
        v.literal("parsing"),
        v.literal("processes"),
        v.literal("writing"),
        v.literal("done"),
      ),
    ),
    syncStartedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Patch only the keys actually supplied so callers can update e.g.
    // just `parseStage` mid-sync without clobbering counts/stats.
    const { id, ...rest } = args;
    const patch: Record<string, unknown> = {};
    for (const [k, v2] of Object.entries(rest)) {
      if (v2 !== undefined) patch[k] = v2;
    }
    await ctx.db.patch(id, patch);
  },
});

/** Internal lister — used by `syncAllMy` so it can iterate user codebases without the avatar join. */
export const listMyInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("codebases")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/** Load a codebase row for internal sync (no user scoping). */
export const getByIdForSyncInternal = internalQuery({
  args: { id: v.id("codebases") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Codebases eligible for the global daily sync workflow.
 * Skips in-progress syncs, fresh syncs, and users without GitHub connected.
 */
export const listForDailySyncInternal = internalQuery({
  args: {},
  returns: v.array(v.object({ codebaseId: v.id("codebases") })),
  handler: async (ctx) => {
    const cutoff = Date.now() - DAILY_SYNC_STALE_MS;
    const all = await ctx.db.query("codebases").collect();
    const out: Array<{ codebaseId: Id<"codebases"> }> = [];

    for (const cb of all) {
      if (cb.isArchived) continue;
      const syncingStale =
        cb.status === "syncing" &&
        (cb.syncStartedAt === undefined ||
          Date.now() - cb.syncStartedAt >= STALE_SYNCING_MS);
      if (cb.status === "syncing" && !syncingStale) continue;
      if (cb.lastSyncedAt !== undefined && cb.lastSyncedAt >= cutoff) {
        continue;
      }

      const connection = await ctx.db
        .query("githubConnections")
        .withIndex("by_user", (q) => q.eq("userId", cb.userId))
        .first();
      if (!connection) continue;

      out.push({ codebaseId: cb._id });
    }

    return out;
  },
});
