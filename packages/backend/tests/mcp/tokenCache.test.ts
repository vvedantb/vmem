import { hashMcpToken, type McpTokenCachePrincipal } from "@vvedantb/server";
import { describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { authenticateWithTokenCache } from "../../convex/mcp/tokenCache";
import {
  convexActionCtx,
  createConvexBackend,
  type ConvexTestBackend,
} from "./convexHarness";

// Wiring only: the cache logic (TTL, JWT exp, put rules, purge batching) is
// tested in @vvedantb/server.

const ALICE = "clerk_token_alice";

function verifier(result: McpTokenCachePrincipal | null) {
  return vi.fn((_token: string) => Promise.resolve(result));
}

async function cacheRows(t: ConvexTestBackend) {
  return t.run((ctx) => ctx.db.query("mcpTokenCache").collect());
}

describe("authenticateWithTokenCache", () => {
  it("verifies on a miss, then serves the cached principal", async () => {
    const t = createConvexBackend();
    const ctx = convexActionCtx(t);
    const verify = verifier({ clerkUserId: ALICE });

    expect(await authenticateWithTokenCache(ctx, "oat_one", verify)).toEqual({
      clerkUserId: ALICE,
    });
    expect(await authenticateWithTokenCache(ctx, "oat_one", verify)).toEqual({
      clerkUserId: ALICE,
    });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("stores the SHA-256 of the token, never the token", async () => {
    const t = createConvexBackend();
    const token = "oat_secret_value";
    await authenticateWithTokenCache(
      convexActionCtx(t),
      token,
      verifier({ clerkUserId: ALICE }),
    );
    const rows = await cacheRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(await hashMcpToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("does not cache a failed verification", async () => {
    const t = createConvexBackend();
    const ctx = convexActionCtx(t);
    const verify = verifier(null);

    expect(await authenticateWithTokenCache(ctx, "oat_bad", verify)).toBeNull();
    expect(await authenticateWithTokenCache(ctx, "oat_bad", verify)).toBeNull();
    expect(verify).toHaveBeenCalledTimes(2);
    expect(await cacheRows(t)).toHaveLength(0);
  });
});

describe("mcpTokenCache purge", () => {
  it("drops expired rows only", async () => {
    const t = createConvexBackend();
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpTokenCache", {
        tokenHash: "old",
        clerkUserId: ALICE,
        expiresAt: Date.now() - 1,
      });
      await ctx.db.insert("mcpTokenCache", {
        tokenHash: "live",
        clerkUserId: ALICE,
        expiresAt: Date.now() + 60_000,
      });
    });
    expect(await t.mutation(internal.mcp.tokenCache.purgeExpired, {})).toBe(1);
    expect((await cacheRows(t)).map((row) => row.tokenHash)).toEqual(["live"]);
  });
});
