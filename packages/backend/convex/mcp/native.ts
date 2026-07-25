import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { extractBearerToken } from "../lib/bearerToken";

function getWebAppUrl(): string {
  const url = process.env.WEB_APP_URL;
  if (!url) {
    throw new Error("WEB_APP_URL is not set in Convex env");
  }
  return url.replace(/\/$/, "");
}

function getClerkFrontendApiUrl(): string {
  const url = process.env.CLERK_FRONTEND_API_URL;
  if (!url) {
    throw new Error("CLERK_FRONTEND_API_URL is not set in Convex env");
  }
  return url.replace(/\/$/, "");
}

function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

// proxies clerk as metadata for older mcp clients that hit this host's well, known
export const oauthMetadata = httpAction(async () => {
  const clerkFrontendApiUrl = getClerkFrontendApiUrl();
  const res = await fetch(
    `${clerkFrontendApiUrl}/.well-known/oauth-authorization-server`,
  );
  if (!res.ok) {
    return Response.json(
      { error: "Failed to fetch authorization server metadata" },
      { status: 502 },
    );
  }
  const metadata: unknown = await res.json();
  return Response.json(metadata);
});

function createProtectedResourceMetadataAction(
  resourcePath: "/mcp" | "/mcp/team",
) {
  return httpAction(async (_ctx, request) => {
    const baseUrl = requestOrigin(request);
    return Response.json({
      resource: `${baseUrl}${resourcePath}`,
      authorization_servers: [getClerkFrontendApiUrl()],
      bearer_methods_supported: ["header"],
      resource_documentation: getWebAppUrl(),
    });
  });
}

export const protectedResourceMetadata =
  createProtectedResourceMetadataAction("/mcp");
export const protectedResourceMetadataTeam =
  createProtectedResourceMetadataAction("/mcp/team");

function unauthorized(message: string, resourceMetadataUrl: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    },
  });
}

// AI-generated (Claude), prompt: "serve mcp over http with clerk bearer auth and oauth protected resource metadata for personal and team scopes"
// Modified by me: unauthorized www authenticate headers and stateless method restrictions
async function runMcpEndpoint(
  ctx: ActionCtx,
  request: Request,
  scope: "personal" | "team",
): Promise<Response> {
  const baseUrl = requestOrigin(request);
  const resourceMetadataUrl =
    scope === "team"
      ? `${baseUrl}/.well-known/oauth-protected-resource/mcp/team`
      : `${baseUrl}/.well-known/oauth-protected-resource`;

  const token = extractBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return unauthorized("Missing Authorization header", resourceMetadataUrl);
  }

  const credentials = await ctx.runAction(
    internal.mcp.nodeActions.verifyAccessToken,
    { token },
  );

  if (!credentials) {
    console.error("[MCP][mcpHandler] token verification failed");
    return unauthorized("Invalid or expired token", resourceMetadataUrl);
  }

  if (request.method === "GET" || request.method === "DELETE") {
    return Response.json(
      { error: "Method not supported in stateless mode" },
      { status: 405 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[MCP][mcpHandler] failed to parse JSON body:", err);
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await ctx.runAction(
    internal.mcp.nodeActions.handleMcpRequest,
    {
      clerkUserId: credentials.clerkUserId,
      body: JSON.stringify(body),
      scope,
    },
  );

  return new Response(result.body, {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

export const mcpHandler = httpAction(async (ctx, request) => {
  return runMcpEndpoint(ctx, request, "personal");
});

export const mcpTeamHandler = httpAction(async (ctx, request) => {
  return runMcpEndpoint(ctx, request, "team");
});

export const health = httpAction(async () => {
  return Response.json({ status: "ok" });
});
