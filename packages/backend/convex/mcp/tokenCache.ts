import { v } from "convex/values";
import { z } from "zod";
import { base64UrlToBytes, sha256Hex } from "@vvedantb/server";
import { internal } from "../_generated/api";
import {
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server";

// Verified MCP bearer tokens, so most requests skip the Node verify action
// (Clerk network plus a Node cold start). Rows hold the SHA-256 of the token,
// never the token. Only successful verifications are cached; a revoked token
// keeps working until its row expires (at most MCP_TOKEN_CACHE_TTL_MS).

export const MCP_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const PURGE_BATCH = 500;

export interface McpPrincipal {
  clerkUserId: string;
}

const jwtExpSchema = z.object({ exp: z.number() });

// `exp` of a JWT in ms, or null for an opaque token or an unreadable payload
export function jwtExpiryMs(token: string): number | null {
  const [, payloadPart, ...rest] = token.split(".");
  if (payloadPart === undefined || rest.length !== 1) return null;
  try {
    const payload = new TextDecoder().decode(base64UrlToBytes(payloadPart));
    const parsed = jwtExpSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** min(now + TTL, token expiry); null when the token is already expired. */
export function tokenCacheExpiresAt(
  token: string,
  nowMs: number,
): number | null {
  const ttlEnd = nowMs + MCP_TOKEN_CACHE_TTL_MS;
  const expiry = jwtExpiryMs(token);
  if (expiry === null) return ttlEnd;
  return expiry > nowMs ? Math.min(ttlEnd, expiry) : null;
}

export const getInternal = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.object({ clerkUserId: v.string(), expiresAt: v.number() }),
    v.null(),
  ),
  // expiry is checked by the caller, so this query stays cacheable
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query("mcpTokenCache")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    return row === null
      ? null
      : { clerkUserId: row.clerkUserId, expiresAt: row.expiresAt };
  },
});

export const putInternal = internalMutation({
  args: {
    tokenHash: v.string(),
    clerkUserId: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mcpTokenCache")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (row === null) {
      await ctx.db.insert("mcpTokenCache", args);
    } else if (
      row.clerkUserId !== args.clerkUserId ||
      row.expiresAt < args.expiresAt
    ) {
      await ctx.db.patch(row._id, {
        clerkUserId: args.clerkUserId,
        expiresAt: args.expiresAt,
      });
    }
    return null;
  },
});

export const purgeExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("mcpTokenCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", Date.now()))
      .take(PURGE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.mcp.tokenCache.purgeExpired, {});
    }
    return rows.length;
  },
});

/**
 * Cache lookup, then `verify` on a miss. A null from `verify` is returned
 * as is and never cached, so invalid tokens behave exactly as before.
 */
export async function authenticateWithTokenCache(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  token: string,
  verify: (token: string) => Promise<McpPrincipal | null>,
): Promise<McpPrincipal | null> {
  const startedAt = Date.now();
  const tokenHash = await sha256Hex(token);
  const cached = await ctx.runQuery(internal.mcp.tokenCache.getInternal, {
    tokenHash,
  });
  if (cached !== null && cached.expiresAt > Date.now()) {
    logAuth(true, startedAt);
    return { clerkUserId: cached.clerkUserId };
  }
  const verified = await verify(token);
  logAuth(false, startedAt);
  if (verified === null) return null;
  const expiresAt = tokenCacheExpiresAt(token, Date.now());
  if (expiresAt !== null) {
    try {
      await ctx.runMutation(internal.mcp.tokenCache.putInternal, {
        tokenHash,
        clerkUserId: verified.clerkUserId,
        expiresAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.warn("[MCP][auth] token cache write failed:", message);
    }
  }
  return verified;
}

function logAuth(cached: boolean, startedAt: number): void {
  console.log(
    "[MCP][auth]",
    JSON.stringify({ authCached: cached, authMs: Date.now() - startedAt }),
  );
}
