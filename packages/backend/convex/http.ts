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

// --- Connector OAuth callback ---

/**
 * Connector OAuth callback — receives the authorization code from Google/Notion redirect.
 * Returns HTML that postMessages to the opener window and closes the popup.
 */
http.route({
  path: "/api/auth/connector/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      // Fallback - shouldn't happen in normal flow
      return new Response(
        callbackHtml("missing_params", null, "http://localhost:3000"),
        { headers: { "Content-Type": "text/html" } },
      );
    }

    const result = await ctx.runAction(
      internal.connectorOAuth.handleCallbackInternal,
      { code, state },
    );

    // returnUrl is stored when OAuth started, fallback only for edge cases
    const frontendUrl = result.frontendUrl ?? "http://localhost:3000";

    return new Response(
      callbackHtml(result.error, result.connectorId, frontendUrl),
      { headers: { "Content-Type": "text/html" } },
    );
  }),
});

function callbackHtml(
  error: string | null,
  connectorId: string | null,
  frontendUrl: string,
): string {
  const success = error === null;
  const message = success
    ? "Connected successfully! You can close this window."
    : `Connection failed: ${error}`;

  return `<!DOCTYPE html>
<html>
<head>
  <title>${success ? "Connected" : "Connection Failed"}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .icon {
      font-size: 48px;
      margin-bottom: 1rem;
    }
    .message {
      color: #333;
      margin-bottom: 1rem;
    }
    .hint {
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${success ? "✓" : "✗"}</div>
    <p class="message">${message}</p>
    <p class="hint">This window will close automatically...</p>
  </div>
  <script>
    try {
      window.opener.postMessage({
        type: "connector-oauth-complete",
        success: ${success},
        connectorId: ${connectorId ? `"${connectorId}"` : "null"},
        error: ${error ? `"${error}"` : "null"}
      }, "${frontendUrl}");
    } catch (e) {
      console.error("Failed to post message:", e);
    }
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`;
}

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
