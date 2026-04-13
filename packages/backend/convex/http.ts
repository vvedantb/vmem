import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// --- GitHub OAuth callback ---

/**
 * GitHub OAuth callback — receives the authorization code from GitHub's redirect.
 * Delegates to handleGitHubCallbackInternal which validates the state, exchanges
 * the code for a token, and stores the encrypted connection.
 */
http.route({
  path: "/api/auth/github/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400 });
    }

    const result = await ctx.runAction(
      internal.github.handleGitHubCallbackInternal,
      { code, state },
    );

    const appUrl = result.returnUrl ?? "http://localhost:3000";

    if (result.error) {
      return Response.redirect(
        `${appUrl}/codebases?error=${encodeURIComponent(result.error)}`,
      );
    }

    return Response.redirect(`${appUrl}/codebases?connected=true`);
  }),
});

// --- MCP REST endpoints ---

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1] ?? null;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

http.route({
  path: "/api/mcp/memories/search",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const token = extractBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing token" }, 401);

    try {
      const body = await req.json();
      const result = await ctx.runAction(
        internal.neo4jActions.mcp.mcpSearchMemories,
        {
          token,
          query: body.query,
          type: body.type,
          tags: body.tags,
          limit: body.limit,
          offset: body.offset,
        },
      );
      return jsonResponse({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      return jsonResponse({ error: msg }, msg.includes("Invalid") ? 401 : 500);
    }
  }),
});

http.route({
  path: "/api/mcp/memories/retrieve",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const token = extractBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing token" }, 401);

    try {
      const body = await req.json();
      const result = await ctx.runAction(
        internal.neo4jActions.mcp.mcpRetrieveMemories,
        {
          token,
          query: body.query,
          limit: body.limit,
        },
      );
      return jsonResponse({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      return jsonResponse({ error: msg }, msg.includes("Invalid") ? 401 : 500);
    }
  }),
});

http.route({
  path: "/api/mcp/memories/create",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const token = extractBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing token" }, 401);

    try {
      const body = await req.json();
      const result = await ctx.runAction(
        internal.neo4jActions.mcp.mcpCreateMemory,
        {
          token,
          title: body.title,
          content: body.content,
          type: body.type,
          source: body.source,
          tags: body.tags,
          confidence: body.confidence,
          url: body.url,
        },
      );
      return jsonResponse({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      return jsonResponse({ error: msg }, msg.includes("Invalid") ? 401 : 500);
    }
  }),
});

http.route({
  path: "/api/mcp/memories/update",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const token = extractBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing token" }, 401);

    try {
      const body = await req.json();
      const result = await ctx.runAction(
        internal.neo4jActions.mcp.mcpUpdateMemory,
        {
          token,
          memoryId: body.memoryId,
          title: body.title,
          content: body.content,
          tags: body.tags,
        },
      );
      return jsonResponse({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      return jsonResponse({ error: msg }, msg.includes("Invalid") ? 401 : 500);
    }
  }),
});

http.route({
  path: "/api/mcp/memories/delete",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const token = extractBearerToken(req);
    if (!token) return jsonResponse({ error: "Missing token" }, 401);

    try {
      const body = await req.json();
      const result = await ctx.runAction(
        internal.neo4jActions.mcp.mcpDeleteMemory,
        {
          token,
          memoryId: body.memoryId,
        },
      );
      return jsonResponse({ data: { deleted: result } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      return jsonResponse({ error: msg }, msg.includes("Invalid") ? 401 : 500);
    }
  }),
});

export default http;
