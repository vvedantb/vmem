"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { createClerkClient } from "@clerk/backend";
import jwt from "jsonwebtoken";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./tools";
import { registerResources } from "./resources";
import { registerMemoryGraphApp } from "./memoryGraphApp";
import { buildMcpServerInfo } from "./branding";

// JWT TTLs match the legacy Railway server so existing Claude connectors
// keep working without re-auth at cutover.
const ACCESS_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60;

function getJwtSecret(): string {
  const secret = process.env.MCP_JWT_SECRET;
  if (!secret) throw new Error("MCP_JWT_SECRET is required");
  return secret;
}

function getClerkSecretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is required");
  return key;
}

const tokensValidator = v.object({
  access_token: v.string(),
  token_type: v.literal("Bearer"),
  expires_in: v.number(),
  scope: v.string(),
  refresh_token: v.string(),
});

function signTokens(clerkUserId: string): {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  refresh_token: string;
} {
  const secret = getJwtSecret();
  const accessToken = jwt.sign({ sub: clerkUserId }, secret, {
    expiresIn: ACCESS_TTL_SECONDS,
  });
  const refreshToken = jwt.sign({ sub: clerkUserId, type: "refresh" }, secret, {
    expiresIn: REFRESH_TTL_SECONDS,
  });
  return {
    access_token: accessToken,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TTL_SECONDS,
    scope: "claudeai",
    refresh_token: refreshToken,
  };
}

export const issueTokens = internalAction({
  args: { clerkUserId: v.string() },
  returns: tokensValidator,
  handler: async (_ctx, { clerkUserId }) => {
    return signTokens(clerkUserId);
  },
});

export const refreshToken = internalAction({
  args: { refreshToken: v.string() },
  returns: v.union(
    v.object({ success: v.literal(true), tokens: tokensValidator }),
    v.object({ success: v.literal(false), error: v.string() }),
  ),
  handler: async (_ctx, { refreshToken }) => {
    try {
      const decoded = jwt.verify(refreshToken, getJwtSecret());
      if (
        typeof decoded !== "object" ||
        decoded === null ||
        typeof decoded.sub !== "string"
      ) {
        return { success: false as const, error: "Invalid refresh token" };
      }
      // Legacy refresh tokens (issued by Railway) didn't carry a `type`
      // claim — accept those too so the refresh flow still works during
      // the cutover. New tokens issued here are tagged.
      const typeClaim =
        "type" in decoded && typeof decoded.type === "string"
          ? decoded.type
          : null;
      if (typeClaim !== null && typeClaim !== "refresh") {
        return { success: false as const, error: "Invalid refresh token" };
      }
      return { success: true as const, tokens: signTokens(decoded.sub) };
    } catch {
      return {
        success: false as const,
        error: "Expired or invalid refresh token",
      };
    }
  },
});

/**
 * Verify the bearer access token. Accepts both the new tokens we issue and
 * legacy Railway-issued tokens (signed with the same `MCP_JWT_SECRET`) so
 * existing Claude connectors survive the cutover. Optionally re-verifies the
 * Clerk user still exists; failures there fail the request closed.
 */
export const verifyAccessToken = internalAction({
  args: { token: v.string() },
  returns: v.union(v.object({ clerkUserId: v.string() }), v.null()),
  handler: async (_ctx, { token }) => {
    let clerkUserId: string | null = null;
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      if (
        typeof decoded === "object" &&
        decoded !== null &&
        typeof decoded.sub === "string"
      ) {
        clerkUserId = decoded.sub;
      } else if (
        typeof decoded === "object" &&
        decoded !== null &&
        "clerkUserId" in decoded &&
        typeof decoded.clerkUserId === "string"
      ) {
        clerkUserId = decoded.clerkUserId;
      }
    } catch (err) {
      console.error(
        "[MCP][verifyAccessToken] jwt verify failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }

    if (!clerkUserId) return null;

    try {
      const clerk = createClerkClient({ secretKey: getClerkSecretKey() });
      await clerk.users.getUser(clerkUserId);
      return { clerkUserId };
    } catch (err) {
      console.error(
        "[MCP][verifyAccessToken] Clerk getUser failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP Request Handler
// ─────────────────────────────────────────────────────────────────────────────

export const handleMcpRequest = internalAction({
  args: {
    clerkUserId: v.string(),
    body: v.string(),
    siteOrigin: v.optional(v.string()),
  },
  returns: v.object({
    status: v.number(),
    body: v.string(),
  }),
  handler: async (ctx, { clerkUserId, body, siteOrigin }) => {
    try {
      const parsedBody = JSON.parse(body);

      const server = new McpServer(buildMcpServerInfo(siteOrigin));

      registerTools(server, clerkUserId, ctx);
      registerMemoryGraphApp(server, clerkUserId, ctx);
      registerResources(server, clerkUserId, ctx);

      // WebStandardStreamableHTTPServerTransport works with Web Standard
      // Request/Response, avoiding Node.js req/res shimming. Stateless
      // mode (no sessionIdGenerator) + JSON responses = fits Convex
      // httpAction → action delegation cleanly.
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      await server.connect(transport);

      const req = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body,
      });

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
