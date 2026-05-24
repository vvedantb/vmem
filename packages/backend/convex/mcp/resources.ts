import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Register MCP Resources for the authenticated user.
 *
 * vmem's implicit-memory pitch: AI clients shouldn't have to fan out into N
 * tool calls just to learn who the user is. The `vmem://context_prompt`
 * resource is read once per conversation — Claude Desktop, Cursor, etc.
 * surface it directly to the model without invoking a tool.
 *
 * The actual prompt is generated server-side (cached in Convex, regenerated
 * on memory writes with a 60s debounce). See `convex/contextPromptApi.ts`
 * for cache + staleness behavior.
 */
export function registerResources(
  server: McpServer,
  clerkUserId: string,
  ctx: ActionCtx,
): void {
  server.registerResource(
    "context_prompt",
    "vmem://context_prompt",
    {
      title: "User Profile",
      description:
        "Synthesized user profile (about + preferences + pinned memories + recent activity summary + available skills index). Read at conversation start.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      let text: string;
      try {
        const result = await ctx.runAction(
          internal.contextPromptApi.mcpGetContextPrompt,
          { clerkId: clerkUserId },
        );
        text = result.content;
      } catch (err) {
        // Surface a graceful placeholder rather than crashing the MCP read —
        // clients keep working, just without enriched context.
        const message = err instanceof Error ? err.message : "unknown error";
        console.error("[MCP][context_prompt] regenerate failed:", message);
        text = `# vmem User Profile\n\n_Profile temporarily unavailable._`;
      }
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
