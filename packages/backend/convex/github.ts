import { generateState } from "arctic";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authAction, authMutation, authQuery } from "./auth";
import { createGitHubOAuth } from "./lib/arcticOAuth";
import { encryptToken, getEnvOrThrow } from "./lib/crypto";
import { createGithubOctokit } from "../engine/github/octokit";
import { z } from "zod";
import { githubConnectionFields } from "./validators";

const GITHUB_OAUTH_SCOPES = ["repo", "read:user"];

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

export const startGitHubOAuth = authAction({
  args: { returnUrl: v.string() },
  handler: async (ctx, args) => {
    const convexSiteUrl = getEnvOrThrow("CONVEX_SITE_URL");
    const redirectUri = `${convexSiteUrl}/api/auth/github/callback`;

    const state = generateState();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    await ctx.runMutation(internal.oauthState.insertOAuthStateInternal, {
      state,
      userId: ctx.userId,
      returnUrl: args.returnUrl,
      expiresAt,
    });

    return createGitHubOAuth(redirectUri)
      .createAuthorizationURL(state, GITHUB_OAUTH_SCOPES)
      .toString();
  },
});

const githubUserProfileSchema = z.object({
  login: z.string().optional(),
  avatar_url: z.string().optional(),
});

type OAuthCallbackResult = {
  error: string | null;
  returnUrl: string | null;
};

export const handleGitHubCallbackInternal = internalAction({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, args): Promise<OAuthCallbackResult> => {
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

    const convexSiteUrl = getEnvOrThrow("CONVEX_SITE_URL");
    const redirectUri = `${convexSiteUrl}/api/auth/github/callback`;

    let accessToken: string;
    try {
      const tokens = await createGitHubOAuth(
        redirectUri,
      ).validateAuthorizationCode(args.code);
      accessToken = tokens.accessToken();
    } catch {
      return {
        error: "token_exchange_failed",
        returnUrl: stateEntry.returnUrl,
      };
    }

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

    const encrypted = await encryptToken(accessToken);
    await ctx.runMutation(internal.github.upsertConnectionInternal, {
      userId: stateEntry.userId,
      githubUsername: userData.login,
      encryptedAccessToken: encrypted,
      avatarUrl: userData.avatar_url,
      connectedAt: Date.now(),
    });

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

export const upsertConnectionInternal = internalMutation({
  args: githubConnectionFields,
  handler: async (ctx, args) => {
    const existing = await getConnectionForUser(ctx, args.userId);
    const { userId, ...fields } = args;

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("githubConnections", { userId, ...fields });
  },
});

export const getDecryptedTokenInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const connection = await getConnectionForUser(ctx, args.userId);
    return connection?.encryptedAccessToken ?? null;
  },
});
