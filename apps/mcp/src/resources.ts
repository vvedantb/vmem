import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthenticatedUser } from "./auth.js";
import { getContextPrompt } from "./api-client.js";

/**
 * Register MCP Resources for the authenticated user.
 *
 * vmem's implicit-memory pitch: AI clients shouldn't have to fan out
 * into N tool calls just to learn who the user is. The
 * `vmem://context_prompt` resource is read once per conversation —
 * Claude Desktop, Cursor, etc. surface it directly to the model
 * without invoking a tool.
 *
 * The actual prompt is generated server-side (cached in Convex,
 * regenerated on memory writes with a 60s debounce) and served via
 * `/api/mcp/context-prompt`. See `convex/contextPromptApi.ts` for
 * cache + staleness behavior.
 */
export function registerResources(
  server: McpServer,
  user: AuthenticatedUser,
): void {
  server.registerResource(
    "context_prompt",
    "vmem://context_prompt",
    {
      title: "User Profile",
      description:
        "Synthesized user profile (about + preferences + pinned memories + recent activity summary). Read at conversation start.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const result = await getContextPrompt(user.token);
      // On error, surface a graceful placeholder rather than crashing
      // the MCP read — clients keep working, just without enriched
      // context.
      const text = result.ok
        ? extractContent(result.text)
        : `# vmem User Profile\n\n_Profile temporarily unavailable (${String(result.status)})._`;
      return {
        contents: [
          {
            uri: uri.toString(),
            text,
            mimeType: "text/markdown",
          },
        ],
      };
    },
  );
}

/**
 * The Convex HTTP layer wraps responses as `{ data: { content, ... } }`.
 * We unwrap defensively — if the server changes shape we still return
 * the raw body rather than blank — and fall back to a placeholder when
 * the JSON doesn't carry markdown content.
 */
function extractContent(rawBody: string): string {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed === "object" && parsed !== null) {
      const data = Reflect.get(parsed, "data");
      if (typeof data === "object" && data !== null) {
        const content = Reflect.get(data, "content");
        if (typeof content === "string" && content.length > 0) {
          return content;
        }
      }
    }
  } catch {
    // fall through
  }
  return "# vmem User Profile\n\n_Profile temporarily unavailable._";
}
