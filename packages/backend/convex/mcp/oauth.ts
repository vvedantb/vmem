import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
} from "../_generated/server";

const CODE_TTL_MS = 5 * 60 * 1000;
const CLIENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Authorize the current Clerk-authenticated user against an MCP OAuth client
 * and return a fresh authorization code.
 *
 * Called from the web app's `/mcp/oauth/authorize` route, which handles the
 * Clerk sign-in flow (production Clerk keys are pinned to the primary web
 * domain, so we cannot mount Clerk inside the Convex-hosted page).
 */
export const authorize = mutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
  },
  returns: v.object({ code: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const clerkUserId = identity.subject;

    const client = await ctx.db
      .query("mcpClientRegistrations")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!client) {
      throw new Error("Unknown client_id");
    }
    if (
      client.redirectUris.length > 0 &&
      !client.redirectUris.includes(args.redirectUri)
    ) {
      throw new Error("redirect_uri does not match registered URIs");
    }

    const codeBytes = new Uint8Array(32);
    crypto.getRandomValues(codeBytes);
    const code = Array.from(codeBytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");

    await ctx.db.insert("mcpAuthCodes", {
      code,
      clerkUserId,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      redirectUri: args.redirectUri,
      clientId: args.clientId,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    return { code };
  },
});

/**
 * Consume an authorization code (retrieve + delete atomically).
 * Returns the code entry if found and not expired, null otherwise.
 */
export const consumeAuthCode = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const entry = await ctx.db
      .query("mcpAuthCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!entry) return null;

    await ctx.db.delete(entry._id);

    if (entry.expiresAt < Date.now()) return null;

    return {
      clerkUserId: entry.clerkUserId,
      codeChallenge: entry.codeChallenge,
      codeChallengeMethod: entry.codeChallengeMethod,
      redirectUri: entry.redirectUri,
      clientId: entry.clientId,
    };
  },
});

/**
 * Register a new OAuth client.
 * Called during dynamic client registration.
 */
export const registerClient = internalMutation({
  args: {
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
    redirectUris: v.array(v.string()),
  },
  handler: async (ctx, { clientId, clientSecret, redirectUris }) => {
    await ctx.db.insert("mcpClientRegistrations", {
      clientId,
      clientSecret,
      redirectUris,
      registeredAt: Date.now(),
    });
  },
});

/**
 * Get an OAuth client by client_id.
 * Returns null if not found or expired (24h soft TTL).
 */
export const getClient = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const client = await ctx.db
      .query("mcpClientRegistrations")
      .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
      .first();

    if (!client) return null;

    if (Date.now() - client.registeredAt > CLIENT_TTL_MS) {
      return null;
    }

    return {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      redirectUris: client.redirectUris,
      registeredAt: client.registeredAt,
    };
  },
});
