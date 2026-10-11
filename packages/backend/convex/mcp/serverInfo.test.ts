/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  isMcpAcceptedTokenType,
  MCP_ACCEPTED_TOKEN_TYPES,
  MCP_SERVER_VERSION,
  mcpServerInfo,
} from "./serverInfo";

describe("MCP server info", () => {
  it("is 2.0.0 and names personal vs team servers", () => {
    expect(MCP_SERVER_VERSION).toBe("2.0.0");
    expect(mcpServerInfo("personal")).toEqual({
      name: "vmem-mcp",
      version: "2.0.0",
    });
    expect(mcpServerInfo("team")).toEqual({
      name: "vmem-mcp-team",
      version: "2.0.0",
    });
  });

  it("accepts Clerk oauth_token and session_token only", () => {
    expect(MCP_ACCEPTED_TOKEN_TYPES).toEqual(["oauth_token", "session_token"]);
    expect(isMcpAcceptedTokenType("oauth_token")).toBe(true);
    expect(isMcpAcceptedTokenType("session_token")).toBe(true);
    expect(isMcpAcceptedTokenType("convex")).toBe(false);
    expect(isMcpAcceptedTokenType("api_key")).toBe(false);
  });
});
