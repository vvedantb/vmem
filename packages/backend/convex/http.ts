import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  oauthMetadata,
  protectedResourceMetadata,
  register as mcpRegister,
  authorizeGet as mcpAuthorizeGet,
  token as mcpToken,
  mcpHandler,
  health as mcpHealth,
} from "./mcp/native";

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
    (function() {
      const payload = {
        type: "connector-oauth-complete",
        success: ${success},
        connectorId: ${connectorId ? `"${connectorId}"` : "null"},
        error: ${error ? `"${error}"` : "null"}
      };

      if (window.opener) {
        try {
          // Try stored origin first
          window.opener.postMessage(payload, "${frontendUrl}");
        } catch (e) {
          console.error("postMessage failed:", e);
        }
        // Also try wildcard as fallback (safe - payload is non-sensitive)
        try {
          window.opener.postMessage(payload, "*");
        } catch (e2) {
          console.error("postMessage wildcard failed:", e2);
        }
      } else {
        console.error("No window.opener - popup may have been opened in new tab");
        document.querySelector('.hint').textContent = "Please close this window and check the main app.";
      }

      setTimeout(() => window.close(), 1500);
    })();
  </script>
</body>
</html>`;
}

// --- MCP server (OAuth + tools/resources) ---

http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "GET",
  handler: oauthMetadata,
});

http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "GET",
  handler: protectedResourceMetadata,
});

http.route({
  path: "/mcp/oauth/register",
  method: "POST",
  handler: mcpRegister,
});

http.route({
  path: "/mcp/oauth/authorize",
  method: "GET",
  handler: mcpAuthorizeGet,
});

http.route({
  path: "/mcp/oauth/token",
  method: "POST",
  handler: mcpToken,
});

http.route({
  path: "/mcp",
  method: "POST",
  handler: mcpHandler,
});

http.route({
  path: "/mcp",
  method: "GET",
  handler: mcpHandler,
});

http.route({
  path: "/mcp",
  method: "DELETE",
  handler: mcpHandler,
});

http.route({
  path: "/health",
  method: "GET",
  handler: mcpHealth,
});

export default http;
