import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { McpScope } from "../profiles/mcpAccess";

export function registerResources(
  server: McpServer,
  clerkUserId: string,
  ctx: ActionCtx,
  scope: McpScope,
): void {
  if (scope === "team") {
    return;
  }

  server.registerResource(
    "context_prompt",
    "vmem://context_prompt",
    {
      title: "User Profile",
      description:
        "Synthesized user profile (about + preferences + pinned memories + recent activity summary + installed skills). Also available via the context_prompt_get tool when the host cannot re-read this resource mid-chat.",
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
