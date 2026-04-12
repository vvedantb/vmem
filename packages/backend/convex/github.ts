import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { authAction, authMutation, authQuery } from "./auth";

// --- Crypto helpers (same pattern as apiKeys.ts) ---

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

async function encryptToken(token: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  return `v1:${uint8ToBase64(iv)}:${uint8ToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptToken(encryptedToken: string): Promise<string> {
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

// --- Public functions ---

export const getConnection = authQuery({
  args: {},
  handler: async (ctx) => {
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();
    if (!connection) return null;
    return {
      id: connection._id,
      githubUsername: connection.githubUsername,
      avatarUrl: connection.avatarUrl,
      connectedAt: connection.connectedAt,
    };
  },
});

export const storeConnection = authAction({
  args: {
    githubUsername: v.string(),
    accessToken: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if already connected
    const existing = await ctx.runQuery(internal.github.getConnectionInternal, {
      userId: ctx.userId,
    });
    if (existing) {
      // Update existing connection
      const encrypted = await encryptToken(args.accessToken);
      await ctx.runMutation(internal.github.updateConnectionInternal, {
        id: existing._id,
        githubUsername: args.githubUsername,
        encryptedAccessToken: encrypted,
        avatarUrl: args.avatarUrl,
        connectedAt: Date.now(),
      });
      return existing._id;
    }

    const encrypted = await encryptToken(args.accessToken);
    const id = await ctx.runMutation(internal.github.insertConnectionInternal, {
      userId: ctx.userId,
      githubUsername: args.githubUsername,
      encryptedAccessToken: encrypted,
      avatarUrl: args.avatarUrl,
      connectedAt: Date.now(),
    });
    return id;
  },
});

export const disconnect = authMutation({
  args: {},
  handler: async (ctx) => {
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();
    if (!connection) return;
    await ctx.db.delete(connection._id);
  },
});

// --- Internal helpers ---

export const getConnectionInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const insertConnectionInternal = internalMutation({
  args: {
    userId: v.id("users"),
    githubUsername: v.string(),
    encryptedAccessToken: v.string(),
    avatarUrl: v.optional(v.string()),
    connectedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("githubConnections", args);
  },
});

export const updateConnectionInternal = internalMutation({
  args: {
    id: v.id("githubConnections"),
    githubUsername: v.string(),
    encryptedAccessToken: v.string(),
    avatarUrl: v.optional(v.string()),
    connectedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

// Retrieve encrypted token for internal use (decryption happens in actions)
export const getDecryptedTokenInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!connection) return null;
    return connection.encryptedAccessToken;
  },
});
