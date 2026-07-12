import { z } from "zod";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { McpScope } from "../profiles/mcpAccess";
import { MEMORY_GRAPH_MCP_APP_HTML } from "./bundled/memoryGraphHtml";

export const MEMORY_GRAPH_RESOURCE_URI = "ui://vmem/memory-graph";

const memoryGraphInputSchema = {
  profileId: z
    .string()
    .optional()
    .describe("Profile ID (defaults to active MCP profile)"),
  focus: z
    .string()
    .optional()
    .describe("Center on one memory id and its neighbourhood"),
  memoryIds: z
    .array(z.string())
    .optional()
    .describe(
      "Memory ids from a prior search/retrieve; shows those nodes plus one-hop neighbours",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Max memory nodes (default 80, max 100; keeps tool result small for Claude context)",
    ),
};

function buildSummaryText(
  graph: {
    stats: {
      nodeCount: number;
      relatesToEdgeCount: number;
      tagEdgeCount: number;
      totalNodesBeforeCap: number;
    };
    truncated: boolean;
  },
  profileId: string | undefined,
): string {
  const parts = [
    `Memory graph: ${graph.stats.nodeCount} memories, ${graph.stats.relatesToEdgeCount} relates-to links, ${graph.stats.tagEdgeCount} tag links.`,
  ];
  if (profileId) parts.push(`Profile: ${profileId}.`);
  if (graph.truncated) {
    parts.push(
      `Truncated from ${graph.stats.totalNodesBeforeCap} memories (MCP payload limit). Use focus or memoryIds to narrow.`,
    );
  }
  parts.push("Interactive graph rendered in MCP App view when supported.");
  return parts.join(" ");
}

export function registerMemoryGraphApp(
  server: McpServer,
  clerkUserId: string,
  ctx: ActionCtx,
  scope: McpScope,
): void {
  registerAppResource(
    server,
    "Memory Graph",
    MEMORY_GRAPH_RESOURCE_URI,
    {
      description:
        "Interactive pan/zoom canvas of vmem memories and their relationships.",
    },
    async () => ({
      contents: [
        {
          uri: MEMORY_GRAPH_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: MEMORY_GRAPH_MCP_APP_HTML,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                resourceDomains: [],
                connectDomains: [],
              },
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "memory_graph",
    {
      title: "Memory graph",
      description:
        "Show an interactive pan/zoom graph of the user's vmem memories (RELATES_TO and shared-tag links). Use when the user asks to visualize, map, or explore their memory graph. After memory_search or memory_retrieve, pass memoryIds to focus on those results. Defaults to active MCP profile unless profileId is set.",
      inputSchema: memoryGraphInputSchema,
      _meta: {
        ui: { resourceUri: MEMORY_GRAPH_RESOURCE_URI },
      },
    },
    async (params) => {
      let graph;
      try {
        graph = await ctx.runAction(internal.mcp.graph.mcpGetMemoryGraph, {
          clerkId: clerkUserId,
          mcpScope: scope,
          profileId: params.profileId,
          focus: params.focus,
          memoryIds: params.memoryIds,
          limit: params.limit,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text",
              text: `Memory graph failed: ${message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: buildSummaryText(graph, params.profileId),
          },
        ],
        structuredContent: graph,
      };
    },
  );
}
