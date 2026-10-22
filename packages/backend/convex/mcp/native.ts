import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { PublicHttpAction } from "convex/server";
import {
  createAuthorizationServerMetadataProxy,
  createHealthHandler,
  createMcpHttpHandler,
  createProtectedResourceMetadata,
} from "@vvedantb/server";
import type { McpScope } from "../profiles/mcpAccess";
import { authenticateWithTokenCache } from "./tokenCache";

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
        authenticateWithTokenCache(ctx, token, (uncached) =>
          ctx.runAction(internal.mcp.nodeActions.verifyAccessToken, {
            token: uncached,
          }),
        ),
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
