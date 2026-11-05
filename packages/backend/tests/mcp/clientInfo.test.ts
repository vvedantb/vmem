import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import {
  initializeClientName,
  mcpConnectionKeys,
  normalizeClientName,
  resolveMcpSource,
} from "../../convex/mcp/clientInfo";
import { createConvexBackend, signUp } from "./convexHarness";

const ALICE = "clerk_client_alice";
const BOB = "clerk_client_bob";

const initialize = (name: string) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name, version: "1.0.0" },
  },
});

describe("initializeClientName", () => {
  it("reads clientInfo.name from an initialize message or batch", () => {
    expect(
      initializeClientName(JSON.stringify(initialize("Claude Code"))),
    ).toBe("claude-code");
    expect(
      initializeClientName(
        JSON.stringify([
          { jsonrpc: "2.0", method: "notifications/initialized" },
          initialize("cursor-vscode"),
        ]),
      ),
    ).toBe("cursor-vscode");
  });

  it("returns null for other methods and bad bodies", () => {
    expect(
      initializeClientName(
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call" }),
      ),
    ).toBeNull();
    expect(initializeClientName("not json")).toBeNull();
    expect(
      initializeClientName(JSON.stringify(initialize("  !!  "))),
    ).toBeNull();
  });
});

describe("normalizeClientName", () => {
  it("slugs and caps the name", () => {
    expect(normalizeClientName(" Claude Desktop ")).toBe("claude-desktop");
    expect(normalizeClientName("x".repeat(100))).toHaveLength(64);
  });
});

describe("resolveMcpSource", () => {
  it("prefers the client name, then the agent source, then mcp", () => {
    expect(
      resolveMcpSource({ clientName: "cursor", agentSource: "claude" }),
    ).toBe("cursor");
    expect(resolveMcpSource({ clientName: null, agentSource: "claude" })).toBe(
      "claude",
    );
    expect(resolveMcpSource({ clientName: null, agentSource: "  " })).toBe(
      "mcp",
    );
    expect(
      resolveMcpSource({ clientName: undefined, agentSource: undefined }),
    ).toBe("mcp");
  });
});

describe("mcpConnectionKeys", () => {
  it("lists the session id first, then the User-Agent", () => {
    expect(
      mcpConnectionKeys({ sessionId: " abc ", userAgent: "Cursor/1.0" }),
    ).toEqual(["sid:abc", "ua:cursor/1.0"]);
    expect(mcpConnectionKeys({ userAgent: "Cursor/1.0" })).toEqual([
      "ua:cursor/1.0",
    ]);
    expect(mcpConnectionKeys({ sessionId: " ", userAgent: "" })).toEqual([]);
  });
});

describe("stored MCP client name (convex-test backend)", () => {
  const resolve = (
    t: ReturnType<typeof createConvexBackend>,
    clerkId: string,
    headers: { sessionId?: string; userAgent?: string },
  ) =>
    t.mutation(internal.mcp.clientInfo.resolveClientNameInternal, {
      clerkId,
      connectionKeys: mcpConnectionKeys(headers),
    });

  it("keeps one name per connection, scoped to the user", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    expect(await resolve(t, ALICE, { userAgent: "Cursor/1.0" })).toBeNull();

    await t.mutation(internal.mcp.clientInfo.recordClientNameInternal, {
      clerkId: ALICE,
      connectionKeys: mcpConnectionKeys({ userAgent: "claude-code/2.0" }),
      name: "Claude Code",
    });
    await t.mutation(internal.mcp.clientInfo.recordClientNameInternal, {
      clerkId: ALICE,
      connectionKeys: mcpConnectionKeys({ userAgent: "Cursor/1.0" }),
      name: "Cursor",
    });
    // the later initialize does not overwrite the other client
    expect(await resolve(t, ALICE, { userAgent: "claude-code/2.0" })).toBe(
      "claude-code",
    );
    expect(await resolve(t, ALICE, { userAgent: "Cursor/1.0" })).toBe("cursor");
    // same User-Agent, other user: no shared row
    expect(await resolve(t, BOB, { userAgent: "Cursor/1.0" })).toBeNull();
  });

  it("prefers the session id over the User-Agent", async () => {
    const t = createConvexBackend();
    await t.mutation(internal.mcp.clientInfo.recordClientNameInternal, {
      clerkId: ALICE,
      connectionKeys: mcpConnectionKeys({ userAgent: "node" }),
      name: "Bee",
    });
    await t.mutation(internal.mcp.clientInfo.recordClientNameInternal, {
      clerkId: ALICE,
      connectionKeys: mcpConnectionKeys({ sessionId: "s1" }),
      name: "Claude",
    });
    expect(
      await resolve(t, ALICE, { sessionId: "s1", userAgent: "node" }),
    ).toBe("claude");
    // unknown session id: falls back to the User-Agent
    expect(
      await resolve(t, ALICE, { sessionId: "s2", userAgent: "node" }),
    ).toBe("bee");
  });

  it("purges connections not seen for 30 days", async () => {
    const t = createConvexBackend();
    const day = 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpSessions", {
        clerkId: ALICE,
        connectionKey: "ua:old",
        clientName: "old",
        lastSeen: Date.now() - 31 * day,
      });
      await ctx.db.insert("mcpSessions", {
        clerkId: ALICE,
        connectionKey: "ua:new",
        clientName: "new",
        lastSeen: Date.now() - day,
      });
    });
    await t.mutation(internal.mcp.clientInfo.purgeExpiredInternal, {});
    const left = await t.run((ctx) => ctx.db.query("mcpSessions").collect());
    expect(left.map((row) => row.clientName)).toEqual(["new"]);
  });
});
