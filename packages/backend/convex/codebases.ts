import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { authAction, authMutation, authQuery } from "./auth";
import { isCodebaseSyncStalled } from "@vmem/shared";
import type { Doc, Id } from "./_generated/dataModel";
import { decryptToken } from "./lib/crypto";
import { createGithubOctokit } from "../engine/github/octokit";
import { retrier } from "./retrier";
import { z } from "zod";
import {
  assertContentDeletable,
  assertContentEditable,
  isContentReadable,
  requireContentScopeAccess,
} from "./teams/auth";

// re-sync codebases that have not synced in the last 24 hours
const DAILY_SYNC_STALE_MS = 24 * 60 * 60 * 1000;

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

async function listScopeCodebases(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<Array<Doc<"codebases">>> {
  if (teamId !== undefined) {
    return await ctx.db
      .query("codebases")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
  }
  const rows = await ctx.db
    .query("codebases")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.filter((cb) => cb.teamId === undefined);
}

async function findDuplicateInScope(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  repoFullName: string,
): Promise<Doc<"codebases"> | null> {
  if (teamId !== undefined) {
    return await ctx.db
      .query("codebases")
      .withIndex("by_team_repo", (q) =>
        q.eq("teamId", teamId).eq("repoFullName", repoFullName),
      )
      .first();
  }
  const matches = await ctx.db
    .query("codebases")
    .withIndex("by_user_repo", (q) =>
      q.eq("userId", userId).eq("repoFullName", repoFullName),
    )
    .collect();
  return matches.find((cb) => cb.teamId === undefined) ?? null;
}

// normalise + readability check shared by public mutate/read paths
async function getReadableCodebaseOrNull(
  ctx: QueryCtx | MutationCtx,
  id: string,
  userId: Id<"users">,
): Promise<Doc<"codebases"> | null> {
  const normalizedId = ctx.db.normalizeId("codebases", id);
  if (!normalizedId) return null;
  const codebase = await ctx.db.get(normalizedId);
  if (!codebase) return null;
  if (!(await isContentReadable(ctx, codebase, userId))) return null;
  return codebase;
}

async function requireReadableCodebase(
  ctx: QueryCtx | MutationCtx,
  id: string,
  userId: Id<"users">,
): Promise<Doc<"codebases">> {
  const codebase = await getReadableCodebaseOrNull(ctx, id, userId);
  if (!codebase) throw new Error("Codebase not found");
  return codebase;
}

// list codebases in a scope
export const listMy = authQuery({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    const codebases = await listScopeCodebases(ctx, ctx.userId, args.teamId);

    // resolve the avatar from the caller's *current* GitHub connection rather than
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
    return await getReadableCodebaseOrNull(ctx, args.id, ctx.userId);
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
    const octokit = createGithubOctokit(token);

    const { data } = await octokit.request("GET /user/repos", {
      per_page: 100,
      sort: "updated",
      type: "all",
    });

    const repos = githubReposSchema.parse(data);

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
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);

    const existing = await findDuplicateInScope(
      ctx,
      ctx.userId,
      args.teamId,
      args.repoFullName,
    );
    if (existing) throw new Error("Repository already added");

    return await ctx.db.insert("codebases", {
      userId: ctx.userId,
      teamId: args.teamId,
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
    const codebase = await requireReadableCodebase(ctx, args.id, ctx.userId);
    await assertContentDeletable(ctx, codebase, ctx.userId);
    // delete the Convex row immediately (keeps the optimistic update snappy) and schedule Neo4j cleanup
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: codebase.userId,
    });
    await ctx.db.delete(codebase._id);
    if (clerkId) {
      // retried (not plain scheduled) so a transient Neo4j outage can't leave
      await retrier.run(
        ctx,
        internal.neo4jActions.codebases.deleteCodebaseInternal,
        { clerkId, codebaseId: codebase._id },
      );
    }
  },
});

// archive or unarchive a codebase
export const setArchived = authMutation({
  args: { id: v.string(), archived: v.boolean() },
  handler: async (ctx, args) => {
    const codebase = await requireReadableCodebase(ctx, args.id, ctx.userId);
    await assertContentEditable(ctx, codebase, ctx.userId);
    await ctx.db.patch(codebase._id, { isArchived: args.archived });
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

    const codebase = await ctx.runQuery(
      internal.codebases.getAccessibleByIdInternal,
      { id: normalizedId, userId: ctx.userId },
    );
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

// re-sync every codebase in the active scope
export const syncAllMy = authAction({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    // explicit type breaks the circular inference caused by re-entering
    // `api.codebases.syncCodebase` below (this action references itself)
    const allCodebases: Array<{ _id: string; isArchived?: boolean }> =
      await ctx.runQuery(internal.codebases.listMyInternal, {
        userId: ctx.userId,
        teamId: args.teamId,
      });
    // archived codebases are intentionally excluded from re-syncs
    const codebases = allCodebases.filter((cb) => !cb.isArchived);
    for (const cb of codebases) {
      try {
        // re-entering the public sync action keeps all the auth/token
        // wiring centralised — no need to duplicate it here
        await ctx.runAction(api.codebases.syncCodebase, { id: cb._id });
      } catch (err) {
        // per-codebase errors are already recorded on the row by syncCodebase;
        // continue to the next one rather than aborting the whole batch
        console.error("syncAllMy: codebase failed", cb._id, err);
      }
    }
    return { synced: codebases.length };
  },
});

export const normalizeCodebaseId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.normalizeId("codebases", args.id);
  },
});

// readable by owner or team member — used by sync / symbol actions
export const getAccessibleByIdInternal = internalQuery({
  args: { id: v.id("codebases"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const codebase = await ctx.db.get(args.id);
    if (!codebase) return null;
    if (!(await isContentReadable(ctx, codebase, args.userId))) return null;
    return codebase;
  },
});

// resolve Neo4j access for a viewer
export const resolveNeo4jAccessInternal = internalQuery({
  args: { codebaseId: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("codebases", args.codebaseId);
    if (!normalizedId) return null;
    const codebase = await ctx.db.get(normalizedId);
    if (!codebase) return null;
    if (!(await isContentReadable(ctx, codebase, args.userId))) return null;
    const owner = await ctx.db.get(codebase.userId);
    if (!owner?.clerkId) return null;
    return { codebaseId: codebase._id, ownerClerkId: owner.clerkId };
  },
});

// owner-only lookup (MCP personal scope)
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
    // phase 1 stats — present only on the final "synced" patch
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
    // patch only the keys actually supplied so callers can update e.g
    // just `parseStage` mid-sync without clobbering counts/stats
    const { id, ...rest } = args;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    await ctx.db.patch(id, patch);
  },
});

// internal lister — used by `syncAllMy` and MCP
export const listMyInternal = internalQuery({
  args: {
    userId: v.id("users"),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    return await listScopeCodebases(ctx, args.userId, args.teamId);
  },
});

// load a codebase row for internal sync (no user scoping)
export const getByIdForSyncInternal = internalQuery({
  args: { id: v.id("codebases") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// flip codebases wedged in `syncing` past the stale window to `error`
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
      await ctx.runMutation(internal.notifications.pushInternal, {
        userId: cb.userId,
        title: `Codebase sync stalled — ${cb.repoFullName}`,
        description:
          "The sync was interrupted before finishing. Open the codebase and click Sync to retry.",
        type: "warning",
      });
      reset += 1;
    }
    return reset;
  },
});

// codebases eligible for the global daily sync workflow
export const listForDailySyncInternal = internalQuery({
  args: {},
  returns: v.array(v.object({ codebaseId: v.id("codebases") })),
  handler: async (ctx) => {
    const cutoff = Date.now() - DAILY_SYNC_STALE_MS;
    const all = await ctx.db.query("codebases").collect();
    const out: Array<{ codebaseId: Id<"codebases"> }> = [];

    for (const cb of all) {
      if (cb.isArchived) continue;
      // skip rows that are genuinely mid-sync; a stalled `syncing` row is
      // eligible for a re-run (same predicate the UI and recovery sweep use)
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
