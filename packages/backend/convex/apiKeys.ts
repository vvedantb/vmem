import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authAction, authMutation, authQuery } from "./auth";

// --- Crypto helpers ---

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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64url = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `vmem_sk_${b64url}`;
}

async function hashApiKey(rawKey: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawKey),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function encryptApiKey(rawKey: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(rawKey),
  );
  return `v1:${uint8ToBase64(iv)}:${uint8ToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptApiKey(encryptedKey: string): Promise<string> {
  const parts = encryptedKey.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted key format");
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

function maskApiKey(rawKey: string): string {
  return `${rawKey.slice(0, 12)}${"*".repeat(16)}${rawKey.slice(-4)}`;
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
    const name = args.name.trim();
    if (!name) {
      throw new Error("Name is required");
    }
    if (name.length > 50) {
      throw new Error("Name must be 50 characters or less");
    }

    const key = generateApiKey();
    const keyHash = await hashApiKey(key);
    const encryptedKey = await encryptApiKey(key);
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
    const apiKey = await ctx.db.get(args.id);
    if (!apiKey || apiKey.userId !== ctx.userId) {
      return false;
    }
    if (apiKey.status !== "active") {
      return false;
    }

    await ctx.db.patch(apiKey._id, {
      status: "revoked",
      revokedAt: Date.now(),
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
