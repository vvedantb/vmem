import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
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

/**
 * Initiates the GitHub OAuth flow.
 * Creates a state token tied to the current user, returns the GitHub authorize URL.
 * Frontend redirects the browser to this URL.
 */
export const startGitHubOAuth = authAction({
  args: { returnUrl: v.string() },
  handler: async (ctx, args) => {
    const clientId = getEnvOrThrow("GITHUB_CLIENT_ID");
    const convexSiteUrl = getEnvOrThrow("CONVEX_SITE_URL");

    const state = crypto.randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    await ctx.runMutation(internal.github.insertOAuthStateInternal, {
      state,
      userId: ctx.userId,
      returnUrl: args.returnUrl,
      expiresAt,
    });

    const redirectUri = `${convexSiteUrl}/api/auth/github/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "repo read:user",
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },
});

/** GitHub token exchange response shape. */
interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
}

/** Subset of GitHub user profile we need. */
interface GitHubUserProfile {
  login?: string;
  avatar_url?: string;
}

/**
 * Handles the GitHub OAuth callback. Called by the httpAction in http.ts.
 * Consumes the state token, exchanges the code for an access token,
 * fetches the user profile, and stores the encrypted connection.
 */
type OAuthCallbackResult = {
  error: string | null;
  returnUrl: string | null;
};

export const handleGitHubCallbackInternal = internalAction({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, args): Promise<OAuthCallbackResult> => {
    // 1. Consume and validate state
    const stateEntry = await ctx.runMutation(
      internal.github.consumeOAuthStateInternal,
      { state: args.state },
    );
    if (!stateEntry) {
      return { error: "invalid_state", returnUrl: null };
    }
    if (stateEntry.expiresAt < Date.now()) {
      return { error: "expired_state", returnUrl: stateEntry.returnUrl };
    }

    // 2. Exchange code for access token
    const clientId = getEnvOrThrow("GITHUB_CLIENT_ID");
    const clientSecret = getEnvOrThrow("GITHUB_CLIENT_SECRET");

    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: args.code,
        }),
      },
    );
    if (!tokenRes.ok) {
      return {
        error: "token_exchange_failed",
        returnUrl: stateEntry.returnUrl,
      };
    }

    const tokenData: GitHubTokenResponse = await tokenRes.json();
    if (!tokenData.access_token) {
      return {
        error: tokenData.error ?? "no_token",
        returnUrl: stateEntry.returnUrl,
      };
    }

    // 3. Fetch GitHub user profile
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!userRes.ok) {
      return { error: "user_fetch_failed", returnUrl: stateEntry.returnUrl };
    }

    const userData: GitHubUserProfile = await userRes.json();
    if (!userData.login) {
      return { error: "user_fetch_failed", returnUrl: stateEntry.returnUrl };
    }

    // 4. Encrypt and store connection
    const existing = await ctx.runQuery(internal.github.getConnectionInternal, {
      userId: stateEntry.userId,
    });
    const encrypted = await encryptToken(tokenData.access_token);

    if (existing) {
      await ctx.runMutation(internal.github.updateConnectionInternal, {
        id: existing._id,
        githubUsername: userData.login,
        encryptedAccessToken: encrypted,
        avatarUrl: userData.avatar_url,
        connectedAt: Date.now(),
      });
    } else {
      await ctx.runMutation(internal.github.insertConnectionInternal, {
        userId: stateEntry.userId,
        githubUsername: userData.login,
        encryptedAccessToken: encrypted,
        avatarUrl: userData.avatar_url,
        connectedAt: Date.now(),
      });
    }

    return { error: null, returnUrl: stateEntry.returnUrl };
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

// --- OAuth state helpers ---

export const insertOAuthStateInternal = internalMutation({
  args: {
    state: v.string(),
    userId: v.id("users"),
    returnUrl: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("oauthStates", args);
  },
});

/**
 * Atomically consumes an OAuth state entry (read + delete).
 * Returns the entry data if found, null otherwise.
 * Being a mutation ensures no two callbacks can consume the same state.
 */
export const consumeOAuthStateInternal = internalMutation({
  args: { state: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      returnUrl: v.string(),
      expiresAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (!entry) return null;

    await ctx.db.delete(entry._id);
    return {
      userId: entry.userId,
      returnUrl: entry.returnUrl,
      expiresAt: entry.expiresAt,
    };
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
