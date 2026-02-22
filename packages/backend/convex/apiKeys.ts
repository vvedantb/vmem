import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authAction, authMutation, authQuery } from "./auth";

type CreateMyResult = {
  id: Id<"apiKeys">;
  name: string;
  key: string;
  maskedKey: string;
};

type RecordUsageResult = {
  accepted: boolean;
  apiKeyId?: Id<"apiKeys">;
};

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

async function getOwnedApiKeyById(
  ctx: { db: { get: (id: Id<"apiKeys">) => Promise<Doc<"apiKeys"> | null> } },
  userId: Id<"users">,
  apiKeyId: string,
): Promise<Doc<"apiKeys"> | null> {
  try {
    const apiKey = await ctx.db.get(apiKeyId as Id<"apiKeys">);
    if (!apiKey || apiKey.userId !== userId) {
      return null;
    }
    return apiKey;
  } catch {
    return null;
  }
}

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
    const name = args.name.trim();
    if (!name) {
      throw new Error("Name is required");
    }
    if (name.length > 50) {
      throw new Error("Name must be 50 characters or less");
    }

    return await ctx.runAction(internal.apiKeysNode.createMyInternal, {
      userId: ctx.userId,
      name,
    });
  },
});

export const revokeMy = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const existing = await getOwnedApiKeyById(ctx, ctx.userId, args.id);
    if (!existing) {
      return false;
    }
    if (existing.status !== "active") {
      return false;
    }

    await ctx.db.patch(existing._id, {
      status: "revoked",
      revokedAt: Date.now(),
    });

    return true;
  },
});

export const recordUsageFromService = action({
  args: {
    ingestSecret: v.string(),
    apiKey: v.string(),
    endpoint: v.string(),
    method: v.string(),
    status: v.number(),
    durationMs: v.number(),
  },
  handler: async (ctx, args): Promise<RecordUsageResult> => {
    return await ctx.runAction(
      internal.apiKeysNode.recordUsageFromService,
      args,
    );
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

    await ctx.db.insert("apiRequestLogs", {
      userId: apiKey.userId,
      apiKeyId: apiKey._id,
      endpoint: args.endpoint,
      method: args.method,
      status: args.status,
      durationMs: args.durationMs,
      createdAt: args.createdAt,
    });

    await ctx.db.patch(apiKey._id, {
      requestCount: apiKey.requestCount + 1,
      lastUsedAt: args.createdAt,
    });

    return { accepted: true, apiKeyId: apiKey._id };
  },
});
