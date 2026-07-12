import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { authAction, authMutation, authQuery, requireClerkId } from "./auth";
import { DAILY_SYNC_STALE_MS } from "./codebaseSyncConstants";
import { isCodebaseSyncStalled } from "@vmem/shared";
import type { Id } from "./_generated/dataModel";
import { decryptToken } from "./lib/crypto";
import { retrier } from "./retrier";
import { parseResponseJson } from "./lib/jsonBoundary";
import { z } from "zod";

// --- GitHub API response shape for repos ---

const githubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: z.object({ login: z.string() }),
  default_branch: z.string(),
  language: z.string().nullable(),
  description: z.string().nullable(),
  private: z.boolean(),
});

const githubReposSchema = z.array(githubRepoSchema);

// --- Public functions ---

export const listMy = authQuery({
  args: {},
  handler: async (ctx) => {
    const codebases = await ctx.db
      .query("codebases")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    // Resolve the avatar from the user's *current* GitHub connection rather
    // than each codebase's stored `githubConnectionId`. A disconnect deletes
    // the connection row and a reconnect creates a new one (e.g. after a
    // username change), so codebases added under an old connection would
    // otherwise point at a deleted row and lose their avatar. A user has a
    // single connection (queried `by_user`), so one lookup covers all rows.
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();
    const avatarUrl = connection?.avatarUrl;

    return codebases.map((cb) => ({ ...cb, avatarUrl }));
  },
});

export const getById = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    // Convex normalizes string → Id at runtime via ctx.db.get
    const codebase = ctx.db.normalizeId("codebases", args.id);
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

    const repos = await parseResponseJson(response, githubReposSchema);

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
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
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
 * Flip codebases wedged in `syncing` past the stale window to `error`. A sync
 * action that times out or whose host dies never writes a terminal status, so
 * the row would otherwise spin forever in the UI and look "in progress" to
 * every consumer that trusts `status`. Runs on a cron (and can be invoked
 * manually) to keep the stored state honest. Returns the number of rows reset.
 */
export const recoverStaleSyncingInternal = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const all = await ctx.db.query("codebases").collect();
    let reset = 0;
    for (const cb of all) {
      if (!isCodebaseSyncStalled(cb.status, cb.syncStartedAt, now)) continue;
      await ctx.db.patch(cb._id, {
        status: "error",
        errorMessage:
          "Sync stalled — the previous run was interrupted before finishing. Click Sync to retry.",
        lastParseError: "Sync stalled — interrupted before completion.",
      });
      reset += 1;
    }
    return reset;
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
      // Skip rows that are genuinely mid-sync; a stalled `syncing` row is
      // eligible for a re-run (same predicate the UI and recovery sweep use).
      if (
        cb.status === "syncing" &&
        !isCodebaseSyncStalled(cb.status, cb.syncStartedAt)
      ) {
        continue;
      }
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
