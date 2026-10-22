"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { createClerkClient } from "@clerk/backend";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  consoleClerkVerifyLogger,
  getClerkClient,
  runSdkMcpRequest,
  verifyClerkAccessToken,
} from "@vvedantb/server";
import { registerTools } from "./tools";
import { registerResources } from "./resources";
import { registerMemoryGraphApp } from "./memoryGraphApp";
import { mcpScopeValidator } from "../profiles/mcpAccess";
import {
  MCP_ACCEPTED_TOKEN_TYPES,
  MCP_SERVER_INSTRUCTIONS,
  mcpServerInfo,
} from "./serverInfo";

// AI-generated (Claude), prompt: "verify clerk oauth access tokens and handle mcp json rpc via streamable http transport with registered tools"
// Modified by me: scope aware server naming and tool registration wiring
export const verifyAccessToken = internalAction({
  args: { token: v.string() },
  returns: v.union(v.object({ clerkUserId: v.string() }), v.null()),
  handler: async (_ctx, { token }) => {
    const verified = await verifyClerkAccessToken(
      () => getClerkClient(createClerkClient),
      token,
      {
        acceptsToken: [...MCP_ACCEPTED_TOKEN_TYPES],
        ...consoleClerkVerifyLogger,
      },
    );
    return verified ? { clerkUserId: verified.userId } : null;
  },
});

// Used by HTTP ingest to create a user row for a Clerk account that has not opened the web app.
export const fetchClerkUserProfile = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.object({
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
  }),
  handler: async (_ctx, { clerkUserId }) => {
    try {
      const clerk = getClerkClient(createClerkClient);
      const user = await clerk.users.getUser(clerkUserId);
      const firstName = user.firstName ?? undefined;
      const lastName = user.lastName ?? undefined;
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      return {
        email: user.primaryEmailAddress?.emailAddress,
        firstName,
        lastName,
        fullName: fullName.length > 0 ? fullName : undefined,
      };
    } catch (err) {
      console.error(
        "[HTTP][fetchClerkUserProfile]",
        err instanceof Error ? err.message : err,
      );
      return {};
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
  handler: async (ctx, { clerkUserId, body, scope }) =>
    runSdkMcpRequest({
      body,
      url:
        scope === "team" ? "http://localhost/mcp/team" : "http://localhost/mcp",
      Transport: WebStandardStreamableHTTPServerTransport,
      createServer: async () => {
        const server = new McpServer(mcpServerInfo(scope), {
          instructions: MCP_SERVER_INSTRUCTIONS,
        });
        registerTools(server, clerkUserId, ctx, scope);
        registerMemoryGraphApp(server, clerkUserId, ctx, scope);
        await registerResources(server, clerkUserId, ctx, scope);
        return server;
      },
    }),
});
