import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authAction, authMutation, authQuery } from "./auth";
import { auditLog, ResourceTypes, severityForStatus } from "./auditLog";
import { decryptToken, encryptToken } from "./lib/crypto";

function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64url = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `vmem_sk_${b64url}`;
}

export async function hashApiKey(rawKey: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawKey),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function decryptApiKey(encryptedKey: string): Promise<string> {
  return decryptToken(encryptedKey);
}

function maskApiKey(rawKey: string): string {
  return `${rawKey.slice(0, 12)}${"*".repeat(16)}${rawKey.slice(-4)}`;
}

export function normalizeApiKeyName(rawName: string): string {
  const name = rawName.trim();
  if (!name) {
    throw new Error("Name is required");
  }
  if (name.length > 50) {
    throw new Error("Name must be 50 characters or less");
  }
  return name;
}

// --- Types ---

type CreateMyResult = {
  id: Id<"apiKeys">;
  name: string;
  key: string;
  maskedKey: string;
};

// --- Response helpers ---

function toApiKeyResponse(apiKey: Doc<"apiKeys">) {
  return {
    id: apiKey._id,
    name: apiKey.name,
    maskedKey: apiKey.maskedKey,
    createdAt: new Date(apiKey.createdAt).toISOString(),
    lastUsedAt: apiKey.lastUsedAt
      ? new Date(apiKey.lastUsedAt).toISOString()
      : null,
    requestCount: apiKey.requestCount,
    status: apiKey.status,
  };
}

// --- Access guard ---

async function getOwnedApiKey(
  ctx: QueryCtx | MutationCtx,
  id: Id<"apiKeys">,
  userId: Id<"users">,
): Promise<Doc<"apiKeys"> | null> {
  const apiKey = await ctx.db.get(id);
  if (!apiKey || apiKey.userId !== userId) {
    return null;
  }
  return apiKey;
}

// --- Public functions ---

export const listMy = authQuery({
  args: {},
  handler: async (ctx) => {
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    apiKeys.sort((a, b) => b.createdAt - a.createdAt);
    return apiKeys.map(toApiKeyResponse);
  },
});

export const createMy = authAction({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<CreateMyResult> => {
    const name = normalizeApiKeyName(args.name);

    const key = generateApiKey();
    const keyHash = await hashApiKey(key);
    const encryptedKey = await encryptToken(key);
    const maskedKey = maskApiKey(key);

    const inserted: { id: Id<"apiKeys"> } = await ctx.runMutation(
      internal.apiKeys.insertKeyInternal,
      {
        userId: ctx.userId,
        name,
        maskedKey,
        keyHash,
        encryptedKey,
        createdAt: Date.now(),
      },
    );

    return { id: inserted.id, name, key, maskedKey };
  },
});

export const revokeMy = authMutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const apiKey = await getOwnedApiKey(ctx, args.id, ctx.userId);
    if (!apiKey || apiKey.status !== "active") {
      return false;
    }

    await ctx.db.patch(apiKey._id, {
      status: "revoked",
      revokedAt: Date.now(),
    });

    // Revocation is a security-relevant event — surface at `warning`.
    await auditLog.log(ctx, {
      action: "api_key.revoked",
      actorId: ctx.userId,
      resourceType: ResourceTypes.API_KEY,
      resourceId: apiKey._id,
      metadata: { name: apiKey.name, maskedKey: apiKey.maskedKey },
      severity: "warning",
    });

    return true;
  },
});

export const deleteMy = authMutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const apiKey = await getOwnedApiKey(ctx, args.id, ctx.userId);
    if (!apiKey) {
      return false;
    }

    await ctx.db.delete(apiKey._id);

    await auditLog.log(ctx, {
      action: "api_key.deleted",
      actorId: ctx.userId,
      resourceType: ResourceTypes.API_KEY,
      resourceId: apiKey._id,
      metadata: {
        name: apiKey.name,
        maskedKey: apiKey.maskedKey,
        status: apiKey.status,
      },
      severity: "warning",
    });

    return true;
  },
});

export const renameMy = authMutation({
  args: { id: v.id("apiKeys"), name: v.string() },
  handler: async (ctx, args) => {
    const name = normalizeApiKeyName(args.name);

    const apiKey = await getOwnedApiKey(ctx, args.id, ctx.userId);
    if (!apiKey) {
      return false;
    }

    if (apiKey.name === name) {
      return true;
    }

    const previousName = apiKey.name;

    await ctx.db.patch(apiKey._id, { name });

    await auditLog.log(ctx, {
      action: "api_key.renamed",
      actorId: ctx.userId,
      resourceType: ResourceTypes.API_KEY,
      resourceId: apiKey._id,
      metadata: {
        previousName,
        name,
        maskedKey: apiKey.maskedKey,
        status: apiKey.status,
      },
      severity: "info",
    });

    return true;
  },
});

export const revealMy = authAction({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, args): Promise<string | null> => {
    const encryptedKey = await ctx.runQuery(
      internal.apiKeys.getEncryptedKeyInternal,
      { id: args.id, userId: ctx.userId },
    );
    if (!encryptedKey) return null;
    return await decryptApiKey(encryptedKey);
  },
});

// --- Internal queries and mutations ---

export const resolveByKeyHashInternal = internalQuery({
  args: { keyHash: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      clerkId: v.string(),
      apiKeyId: v.id("apiKeys"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.keyHash))
      .first();

    if (!apiKey || apiKey.status !== "active") {
      return null;
    }

    const user = await ctx.db.get(apiKey.userId);
    if (!user?.clerkId) {
      return null;
    }

    return {
      userId: apiKey.userId,
      clerkId: user.clerkId,
      apiKeyId: apiKey._id,
    };
  },
});

export const getEncryptedKeyInternal = internalQuery({
  args: { id: v.id("apiKeys"), userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const apiKey = await ctx.db.get(args.id);
    if (
      !apiKey ||
      apiKey.userId !== args.userId ||
      apiKey.status !== "active"
    ) {
      return null;
    }
    return apiKey.encryptedKey;
  },
});

export const insertKeyInternal = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    maskedKey: v.string(),
    keyHash: v.string(),
    encryptedKey: v.string(),
    createdAt: v.number(),
  },
  returns: v.object({
    id: v.id("apiKeys"),
  }),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("apiKeys", {
      userId: args.userId,
      name: args.name,
      maskedKey: args.maskedKey,
      keyHash: args.keyHash,
      encryptedKey: args.encryptedKey,
      status: "active",
      requestCount: 0,
      createdAt: args.createdAt,
    });

    await auditLog.log(ctx, {
      action: "api_key.created",
      actorId: args.userId,
      resourceType: ResourceTypes.API_KEY,
      resourceId: id,
      metadata: { name: args.name, maskedKey: args.maskedKey },
      severity: "info",
    });

    return { id };
  },
});

export const recordUsageInternal = internalMutation({
  args: {
    keyHash: v.string(),
    endpoint: v.string(),
    method: v.string(),
    status: v.number(),
    durationMs: v.number(),
    createdAt: v.number(),
  },
  returns: v.object({
    accepted: v.boolean(),
    apiKeyId: v.optional(v.id("apiKeys")),
  }),
  handler: async (ctx, args) => {
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.keyHash))
      .first();

    if (!apiKey || apiKey.status !== "active") {
      return { accepted: false };
    }

    await auditLog.log(ctx, {
      action: "api_request",
      actorId: apiKey.userId,
      resourceType: ResourceTypes.API_REQUEST,
      resourceId: apiKey._id,
      metadata: {
        endpoint: args.endpoint,
        method: args.method,
        status: args.status,
        durationMs: args.durationMs,
      },
      severity: severityForStatus(args.status),
    });

    await ctx.db.patch(apiKey._id, {
      requestCount: apiKey.requestCount + 1,
      lastUsedAt: args.createdAt,
    });

    return { accepted: true, apiKeyId: apiKey._id };
  },
});
