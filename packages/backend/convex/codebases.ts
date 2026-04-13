import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { authAction, authMutation, authQuery } from "./auth";

// --- Crypto helpers (same pattern as apiKeys.ts, needed for token decryption in actions) ---

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyB64 = getEnvOrThrow("ENCRYPTION_KEY");
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function decryptToken(encryptedToken: string): Promise<string> {
  const parts = encryptedToken.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted token format");
  }
  const [, ivB64, encB64] = parts;
  const key = await getEncryptionKey();
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const enc = Uint8Array.from(atob(encB64), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    enc,
  );
  return new TextDecoder().decode(decrypted);
}

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
    await ctx.db.delete(normalizedId);
    // Note: Neo4j cleanup happens when Hono API is called with delete
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

    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: ctx.userId,
    });
    if (!clerkId) throw new Error("User not found");

    const encryptedToken = await ctx.runQuery(
      internal.github.getDecryptedTokenInternal,
      { userId: ctx.userId },
    );
    if (!encryptedToken) throw new Error("GitHub not connected");

    const token = await decryptToken(encryptedToken);

    await ctx.runMutation(internal.codebases.updateStatusInternal, {
      id: normalizedId,
      status: "syncing",
      syncedFiles: 0,
      errorMessage: undefined,
    });

    try {
      const result = await ctx.runAction(
        internal.neo4jActions.codebases.syncCodebaseInternal,
        {
          clerkId,
          codebaseId: normalizedId,
          repoOwner: codebase.repoOwner,
          repoName: codebase.repoName,
          branch: codebase.defaultBranch,
          githubToken: token,
        },
      );

      await ctx.runMutation(internal.codebases.updateStatusInternal, {
        id: normalizedId,
        status: "synced",
        totalFiles: result.totalFiles,
        totalEdges: result.totalEdges,
        syncedFiles: result.totalFiles,
        lastSyncedAt: Date.now(),
        errorMessage: undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown sync error";
      await ctx.runMutation(internal.codebases.updateStatusInternal, {
        id: normalizedId,
        status: "error",
        errorMessage: message,
      });
      throw err;
    }
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
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
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
    status: v.union(
      v.literal("pending"),
      v.literal("syncing"),
      v.literal("synced"),
      v.literal("error"),
    ),
    totalFiles: v.optional(v.number()),
    totalEdges: v.optional(v.number()),
    syncedFiles: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const {
      id,
      status,
      totalFiles,
      totalEdges,
      syncedFiles,
      lastSyncedAt,
      errorMessage,
    } = args;
    // Build patch object with only defined fields
    const patch: {
      status: typeof status;
      totalFiles?: number;
      totalEdges?: number;
      syncedFiles?: number;
      lastSyncedAt?: number;
      errorMessage?: string;
    } = { status };
    if (totalFiles !== undefined) patch.totalFiles = totalFiles;
    if (totalEdges !== undefined) patch.totalEdges = totalEdges;
    if (syncedFiles !== undefined) patch.syncedFiles = syncedFiles;
    if (lastSyncedAt !== undefined) patch.lastSyncedAt = lastSyncedAt;
    if (errorMessage !== undefined) patch.errorMessage = errorMessage;
    await ctx.db.patch(id, patch);
  },
});
