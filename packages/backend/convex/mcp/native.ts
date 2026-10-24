import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { PublicHttpAction } from "convex/server";
import {
  createAuthorizationServerMetadataProxy,
  createHealthHandler,
  createMcpHttpHandler,
  createProtectedResourceMetadata,
  authenticateClerkBearer,
  requiredEnvUrl,
} from "@vvedantb/server";
import type { McpScope } from "../profiles/mcpAccess";

// proxies clerk as metadata for older mcp clients that hit this host's well, known
export const oauthMetadata = httpAction(
  createAuthorizationServerMetadataProxy(),
);
export const protectedResourceMetadata = httpAction(
  createProtectedResourceMetadata(),
);
export const protectedResourceMetadataTeam = httpAction(
  createProtectedResourceMetadata({ resourcePath: "/mcp/team" }),
);

function mcpEndpoint(scope: McpScope): PublicHttpAction {
  return httpAction(
    createMcpHttpHandler<{ clerkUserId: string }, ActionCtx, McpScope>({
      scope,
      resourceMetadataPath:
        scope === "team"
          ? "/.well-known/oauth-protected-resource/mcp/team"
          : undefined,
      authenticate: ({ ctx, token }) =>
        authenticateClerkBearer({
          token,
          issuer: requiredEnvUrl("CLERK_FRONTEND_API_URL"),
          // opaque tokens only; JWTs verify locally
          verifyOpaque: (opaque) =>
            ctx.runAction(internal.mcp.nodeActions.verifyAccessToken, {
              token: opaque,
            }),
          onReject: (rejection) => {
            console.error(
              "[MCP][authenticateClerkBearer] rejected:",
              rejection.kind,
            );
          },
          onError: (err) => {
            console.error(
              "[MCP][authenticateClerkBearer] threw:",
              err instanceof Error ? err.message : err,
            );
          },
        }),
      handleRpc: ({ ctx, principal, body }) =>
        ctx.runAction(internal.mcp.nodeActions.handleMcpRequest, {
          clerkUserId: principal.clerkUserId,
          body,
          scope,
        }),
    }),
  );
}

export const mcpHandler = mcpEndpoint("personal");
export const mcpTeamHandler = mcpEndpoint("team");
export const health = httpAction(createHealthHandler());
