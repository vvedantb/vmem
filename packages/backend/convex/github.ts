import { v } from "convex/values";
import {
  exchangeWebFlowCode,
  getWebFlowAuthorizationUrl,
} from "@octokit/oauth-methods";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authAction, authMutation, authQuery } from "./auth";
import { encryptToken, getEnvOrThrow } from "./lib/crypto";
import { createGithubOctokit } from "../engine/github/octokit";
import { z } from "zod";

export const getConnection = authQuery({
  args: {},
  handler: async (ctx) => {
    const connection = await getConnectionForUser(ctx, ctx.userId);
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

    await ctx.runMutation(internal.oauthState.insertOAuthStateInternal, {
      state,
      userId: ctx.userId,
      returnUrl: args.returnUrl,
      expiresAt,
    });

    const redirectUri = `${convexSiteUrl}/api/auth/github/callback`;
    const { url } = getWebFlowAuthorizationUrl({
      clientType: "oauth-app",
      clientId,
      redirectUrl: redirectUri,
      scopes: ["repo", "read:user"],
      state,
    });

    return url;
  },
});

/** Subset of GitHub user profile we need. */
const githubUserProfileSchema = z.object({
  login: z.string().optional(),
  avatar_url: z.string().optional(),
});

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
      internal.oauthState.consumeOAuthStateInternal,
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

    let accessToken: string;
    try {
      const { authentication } = await exchangeWebFlowCode({
        clientType: "oauth-app",
        clientId,
        clientSecret,
        code: args.code,
      });
      accessToken = authentication.token;
    } catch {
      return {
        error: "token_exchange_failed",
        returnUrl: stateEntry.returnUrl,
      };
    }

    // 3. Fetch GitHub user profile
    const octokit = createGithubOctokit(accessToken);
    let userData: z.infer<typeof githubUserProfileSchema>;
    try {
      const { data } = await octokit.request("GET /user");
      userData = githubUserProfileSchema.parse(data);
    } catch {
      return { error: "user_fetch_failed", returnUrl: stateEntry.returnUrl };
    }
    if (!userData.login) {
      return { error: "user_fetch_failed", returnUrl: stateEntry.returnUrl };
    }

    // 4. Encrypt and store connection
    const existing = await ctx.runQuery(internal.github.getConnectionInternal, {
      userId: stateEntry.userId,
    });
    const encrypted = await encryptToken(accessToken);

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
    const connection = await getConnectionForUser(ctx, ctx.userId);
    if (!connection) return;
    await ctx.db.delete(connection._id);
  },
});

async function getConnectionForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("githubConnections")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

export const getConnectionInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await getConnectionForUser(ctx, args.userId);
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

/** Encrypted token for internal use (decryption happens in actions). */
export const getDecryptedTokenInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const connection = await getConnectionForUser(ctx, args.userId);
    return connection?.encryptedAccessToken ?? null;
  },
});
