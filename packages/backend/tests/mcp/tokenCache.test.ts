import { sha256Hex } from "@vvedantb/server";
import { describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import {
  authenticateWithTokenCache,
  jwtExpiryMs,
  MCP_TOKEN_CACHE_TTL_MS,
  tokenCacheExpiresAt,
  type McpPrincipal,
} from "../../convex/mcp/tokenCache";
import {
  convexActionCtx,
  createConvexBackend,
  type ConvexTestBackend,
} from "./convexHarness";

const ALICE = "clerk_token_alice";

function base64Url(value: string): string {
  return btoa(value)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function jwtWithExp(expSeconds: number): string {
  return [
    base64Url(JSON.stringify({ alg: "RS256" })),
    base64Url(JSON.stringify({ sub: ALICE, exp: expSeconds })),
    "signature",
  ].join(".");
}

function verifier(result: McpPrincipal | null) {
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
    expect(rows[0]?.tokenHash).toBe(await sha256Hex(token));
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

  it("verifies again once the cached row has expired", async () => {
    const t = createConvexBackend();
    const ctx = convexActionCtx(t);
    const verify = verifier({ clerkUserId: ALICE });
    await authenticateWithTokenCache(ctx, "oat_two", verify);
    await t.run(async (inner) => {
      for (const row of await inner.db.query("mcpTokenCache").collect()) {
        await inner.db.patch(row._id, { expiresAt: Date.now() - 1 });
      }
    });

    await authenticateWithTokenCache(ctx, "oat_two", verify);
    expect(verify).toHaveBeenCalledTimes(2);
    const [row] = await cacheRows(t);
    expect(row?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("keys on the token: another token is a miss", async () => {
    const t = createConvexBackend();
    const ctx = convexActionCtx(t);
    const verify = verifier({ clerkUserId: ALICE });
    await authenticateWithTokenCache(ctx, "oat_a", verify);
    await authenticateWithTokenCache(ctx, "oat_b", verify);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("does not cache a JWT that is already expired", async () => {
    const t = createConvexBackend();
    const token = jwtWithExp(Math.floor(Date.now() / 1000) - 10);
    const result = await authenticateWithTokenCache(
      convexActionCtx(t),
      token,
      verifier({ clerkUserId: ALICE }),
    );
    expect(result).toEqual({ clerkUserId: ALICE });
    expect(await cacheRows(t)).toHaveLength(0);
  });
});

describe("tokenCacheExpiresAt", () => {
  const now = 1_700_000_000_000;

  it("uses the TTL for an opaque token", () => {
    expect(tokenCacheExpiresAt("oat_opaque", now)).toBe(
      now + MCP_TOKEN_CACHE_TTL_MS,
    );
  });

  it("caps the TTL at a JWT exp", () => {
    const exp = Math.floor(now / 1000) + 60;
    expect(jwtExpiryMs(jwtWithExp(exp))).toBe(exp * 1000);
    expect(tokenCacheExpiresAt(jwtWithExp(exp), now)).toBe(exp * 1000);
  });

  it("keeps the TTL when the JWT outlives it", () => {
    const exp = Math.floor(now / 1000) + 3600;
    expect(tokenCacheExpiresAt(jwtWithExp(exp), now)).toBe(
      now + MCP_TOKEN_CACHE_TTL_MS,
    );
  });

  it("treats an unreadable payload as opaque", () => {
    expect(jwtExpiryMs("a.not-json.c")).toBeNull();
    expect(tokenCacheExpiresAt("a.not-json.c", now)).toBe(
      now + MCP_TOKEN_CACHE_TTL_MS,
    );
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
