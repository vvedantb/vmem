import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import {
  initializeClientName,
  normalizeClientName,
  resolveMcpSource,
} from "../../convex/mcp/clientInfo";
import { createConvexBackend, signUp } from "./convexHarness";

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

describe("stored MCP client name (convex-test backend)", () => {
  it("records a normalized name per user and reads it back", async () => {
    const t = createConvexBackend();
    await signUp(t, "clerk_client_alice", "alice@example.com");
    expect(
      await t.query(internal.mcp.clientInfo.getClientNameInternal, {
        clerkId: "clerk_client_alice",
      }),
    ).toBeNull();
    await t.mutation(internal.mcp.clientInfo.recordClientNameInternal, {
      clerkId: "clerk_client_alice",
      name: "Claude Code",
    });
    expect(
      await t.query(internal.mcp.clientInfo.getClientNameInternal, {
        clerkId: "clerk_client_alice",
      }),
    ).toBe("claude-code");
    // no users row: nothing is written
    await t.mutation(internal.mcp.clientInfo.recordClientNameInternal, {
      clerkId: "clerk_client_nobody",
      name: "cursor",
    });
    expect(
      await t.query(internal.mcp.clientInfo.getClientNameInternal, {
        clerkId: "clerk_client_nobody",
      }),
    ).toBeNull();
  });
});
