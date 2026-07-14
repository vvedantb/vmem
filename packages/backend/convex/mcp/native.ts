import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { extractBearerToken } from "../lib/bearerToken";
import { z } from "zod";

function getWebAppUrl(): string {
  const url = process.env.WEB_APP_URL;
  if (!url) {
    throw new Error("WEB_APP_URL is not set in Convex env");
  }
  return url.replace(/\/$/, "");
}

function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

export const oauthMetadata = httpAction(async (_ctx, request) => {
  const baseUrl = requestOrigin(request);
  return Response.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/mcp/oauth/authorize`,
    token_endpoint: `${baseUrl}/mcp/oauth/token`,
    registration_endpoint: `${baseUrl}/mcp/oauth/register`,
    service_documentation: getWebAppUrl(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

function createProtectedResourceMetadataAction(
  resourcePath: "/mcp" | "/mcp/team",
) {
  return httpAction(async (_ctx, request) => {
    const baseUrl = requestOrigin(request);
    return Response.json({
      resource: `${baseUrl}${resourcePath}`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
      resource_documentation: getWebAppUrl(),
    });
  });
}

export const protectedResourceMetadata =
  createProtectedResourceMetadataAction("/mcp");
export const protectedResourceMetadataTeam =
  createProtectedResourceMetadataAction("/mcp/team");

function parseRedirectUris(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const redirectUris: string[] = [];
  for (const uri of raw) {
    if (typeof uri !== "string") continue;
    try {
      const parsed = new URL(uri);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        redirectUris.push(uri);
      }
    } catch {
      // skip invalid URIs
    }
  }
  return redirectUris;
}

const registerBodySchema = z
  .object({
    redirect_uris: z
      .preprocess(parseRedirectUris, z.array(z.string()))
      .default([]),
    grant_types: z.array(z.string()).default(["authorization_code"]),
    response_types: z.array(z.string()).default(["code"]),
    token_endpoint_auth_method: z.string().default("none"),
  })
  .passthrough();

export const register = httpAction(async (ctx, request) => {
  try {
    const raw: unknown = await request.json();
    const bodyParse = registerBodySchema.safeParse(raw);
    if (!bodyParse.success) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    const body = bodyParse.data;
    const clientId = crypto.randomUUID();

    await ctx.runMutation(internal.mcp.oauth.registerClient, {
      clientId,
      redirectUris: body.redirect_uris,
    });

    return Response.json(
      {
        ...body,
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return Response.json({ error: message }, { status: 400 });
  }
});

const authorizeQuerySchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  state: z.string(),
  code_challenge: z.string(),
  code_challenge_method: z.string(),
});

export const authorizeGet = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const params = authorizeQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    );

    const client = await ctx.runQuery(internal.mcp.oauth.getClient, {
      clientId: params.client_id,
    });

    if (!client) {
      return new Response("<h1>Error</h1><p>Unknown client_id</p>", {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    const target = new URL(`${getWebAppUrl()}/mcp/oauth/authorize`);
    for (const [key, value] of Object.entries(params)) {
      target.searchParams.set(key, value);
    }

    return Response.redirect(target.toString(), 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authorization failed";
    return new Response(`<h1>Error</h1><p>${message}</p>`, {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }
});

const authCodeBodySchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string(),
  redirect_uri: z.string(),
  code_verifier: z.string(),
  client_id: z.string(),
});

const refreshBodySchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string(),
  client_id: z.string(),
});

export const token = httpAction(async (ctx, request) => {
  const contentType = request.headers.get("Content-Type") ?? "";
  // parsed via text/URLSearchParams (not request.formData()) and an entries walk (not
  const body: Record<string, string> = {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(await request.text());
    params.forEach((value, key) => {
      body[key] = value;
    });
  } else {
    try {
      const raw: unknown = await request.json();
      if (typeof raw !== "object" || raw === null) {
        throw new Error("Invalid JSON body");
      }
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === "string") {
          body[key] = value;
        }
      }
    } catch (err) {
      console.error("[MCP][token] failed to parse JSON body:", err);
      return Response.json(
        { error: "invalid_request", error_description: "Invalid request body" },
        { status: 400 },
      );
    }
  }

  // refresh token grant
  const refreshParse = refreshBodySchema.safeParse(body);
  if (refreshParse.success) {
    const result = await ctx.runAction(internal.mcp.nodeActions.refreshToken, {
      refreshToken: refreshParse.data.refresh_token,
    });
    if (!result.success) {
      console.error("[MCP][token] refresh failed:", result.error);
      return Response.json(
        { error: "invalid_grant", error_description: result.error },
        { status: 400 },
      );
    }
    return Response.json(result.tokens);
  }

  // authorization code grant
  const parseResult = authCodeBodySchema.safeParse(body);
  if (!parseResult.success) {
    console.error(
      "[MCP][token] invalid request body. keys:",
      Object.keys(body),
      "issues:",
      parseResult.error.issues,
    );
    return Response.json(
      {
        error: "invalid_request",
        error_description: "Missing or invalid parameters",
      },
      { status: 400 },
    );
  }
  const params = parseResult.data;

  const entry = await ctx.runMutation(internal.mcp.oauth.consumeAuthCode, {
    code: params.code,
  });

  if (!entry) {
    console.error("[MCP][token] auth code not found or expired");
    return Response.json(
      {
        error: "invalid_grant",
        error_description: "Invalid or expired authorization code",
      },
      { status: 400 },
    );
  }

  if (entry.redirectUri !== params.redirect_uri) {
    console.error(
      "[MCP][token] redirect_uri mismatch. stored:",
      entry.redirectUri,
      "given:",
      params.redirect_uri,
    );
    return Response.json(
      { error: "invalid_grant", error_description: "Redirect URI mismatch" },
      { status: 400 },
    );
  }

  // PKCE verification using Web Crypto (httpAction runs on V8 — no node import)
  const expectedChallenge = await pkceS256Challenge(params.code_verifier);

  if (expectedChallenge !== entry.codeChallenge) {
    console.error(
      "[MCP][token] PKCE failed. expected:",
      expectedChallenge,
      "stored:",
      entry.codeChallenge,
    );
    return Response.json(
      { error: "invalid_grant", error_description: "PKCE verification failed" },
      { status: 400 },
    );
  }

  const tokens = await ctx.runAction(internal.mcp.nodeActions.issueTokens, {
    clerkUserId: entry.clerkUserId,
  });

  return Response.json(tokens);
});

function unauthorized(message: string, resourceMetadataUrl: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    },
  });
}

async function pkceS256Challenge(verifier: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

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
