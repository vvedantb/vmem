"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { createClerkClient } from "@clerk/backend";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./tools";
import { registerResources } from "./resources";
import { registerMemoryGraphApp } from "./memoryGraphApp";
import { mcpScopeValidator, type McpScope } from "../profiles/mcpAccess";

function mcpServerInfo(scope: McpScope): {
  name: string;
  version: string;
} {
  return {
    name: scope === "team" ? "vmem-mcp-team" : "vmem-mcp",
    version: "1.0.0",
  };
}

function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required");
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error("CLERK_PUBLISHABLE_KEY is required");
  return createClerkClient({ secretKey, publishableKey });
}

/** Verifies a Clerk-issued OAuth access token (MCP bearer). Existing custom JWTs are invalid — clients must reconnect. */
// AI-generated (Claude), prompt: "verify clerk oauth access tokens and handle mcp json rpc via streamable http transport with registered tools"
// Modified by me: scope aware server naming and tool registration wiring
export const verifyAccessToken = internalAction({
  args: { token: v.string() },
  returns: v.union(v.object({ clerkUserId: v.string() }), v.null()),
  handler: async (_ctx, { token }) => {
    try {
      const clerk = getClerkClient();
      const request = new Request("https://mcp.local/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const state = await clerk.authenticateRequest(request, {
        acceptsToken: "oauth_token",
      });
      if (!state.isAuthenticated) {
        console.error(
          "[MCP][verifyAccessToken] authenticateRequest failed:",
          state.reason,
          state.message,
        );
        return null;
      }

      const auth = state.toAuth();
      if (!auth.isAuthenticated || auth.tokenType !== "oauth_token") {
        return null;
      }
      if (typeof auth.userId !== "string" || auth.userId.length === 0) {
        return null;
      }
      return { clerkUserId: auth.userId };
    } catch (err) {
      console.error(
        "[MCP][verifyAccessToken] threw:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  },
});

export const handleMcpRequest = internalAction({
  args: {
    clerkUserId: v.string(),
    body: v.string(),
    scope: mcpScopeValidator,
  },
  returns: v.object({
    status: v.number(),
    body: v.string(),
  }),
  handler: async (ctx, { clerkUserId, body, scope }) => {
    try {
      const parsedBody: unknown = JSON.parse(body);

      const server = new McpServer(mcpServerInfo(scope));

      registerTools(server, clerkUserId, ctx, scope);
      registerMemoryGraphApp(server, clerkUserId, ctx, scope);
      registerResources(server, clerkUserId, ctx, scope);

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      await server.connect(transport);

      const req = new Request(
        scope === "team" ? "http://localhost/mcp/team" : "http://localhost/mcp",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body,
        },
      );

      const response = await transport.handleRequest(req, { parsedBody });
      const responseBody = await response.text();

      return {
        status: response.status,
        body: responseBody,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal server error";
      console.error("[MCP][handleMcpRequest] threw:", message, err);
      return {
        status: 500,
        body: JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message },
          id: null,
        }),
      };
    }
  },
});
