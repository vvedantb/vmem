import { z } from "zod";
import { memoryTypeSchema } from "@vmem/sdk";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ActionCtx } from "../_generated/server";
import type { McpScope } from "../profiles/mcpAccess";
import { MEMORY_GRAPH_MCP_APP_HTML } from "./bundled/memoryGraphHtml";
import { getMemoryGraphForMcp, type McpMemoryGraphResult } from "./graph";

const MEMORY_GRAPH_RESOURCE_URI = "ui://vmem/memory-graph";

export const memoryGraphInputSchema = {
  profileId: z
    .string()
    .optional()
    .describe("Profile ID (defaults to active MCP profile)"),
  focus: z
    .string()
    .optional()
    .describe(
      "Center on one memory id: that memory plus every memory one link away",
    ),
  memoryIds: z
    .array(z.string())
    .optional()
    .describe(
      "Memory ids from a prior search/retrieve; shows those nodes plus one-hop neighbours",
    ),
  types: z
    .array(memoryTypeSchema)
    .optional()
    .describe("Only memories of these types (any of)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Only memories carrying every one of these tags"),
  sources: z
    .array(z.string())
    .optional()
    .describe("Only memories from these sources (any of)"),
  cursor: z
    .string()
    .optional()
    .describe("nextCursor from a previous memory_graph call (next page)"),
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
  graph: McpMemoryGraphResult,
  profileId: string | undefined,
): string {
  const parts = [
    `Memory graph: ${graph.stats.nodeCount} memories, ${graph.stats.relatesToEdgeCount} relates-to links, ${graph.stats.tagEdgeCount} tag links, ${graph.stats.entityCount} entities.`,
  ];
  if (profileId) parts.push(`Profile: ${profileId}.`);
  if (graph.truncated) {
    parts.push(
      `Showing ${graph.stats.nodeCount} of ${graph.stats.totalNodesBeforeCap} memories (MCP payload limit). Pass cursor "${graph.nextCursor ?? ""}" for the next page, or use focus, memoryIds or filters to narrow.`,
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
        "Show an interactive pan/zoom graph of the user's vmem memories (RELATES_TO and shared-tag links). Use when the user asks to visualize, map, or explore their memory graph. After memory_search or memory_retrieve, pass memoryIds to focus on those results plus their one-hop neighbours. Filter with types, tags and sources; page with cursor. structuredContent also lists the entities (people, organisations, places, technologies) the shown memories mention, with mentionsEdges. Defaults to active MCP profile unless profileId is set.",
      inputSchema: memoryGraphInputSchema,
      _meta: {
        ui: { resourceUri: MEMORY_GRAPH_RESOURCE_URI },
      },
    },
    async (params) => {
      try {
        const graph = await getMemoryGraphForMcp(ctx, {
          clerkId: clerkUserId,
          mcpScope: scope,
          profileId: params.profileId,
          focus: params.focus,
          memoryIds: params.memoryIds,
          types: params.types,
          tags: params.tags,
          sources: params.sources,
          cursor: params.cursor,
          limit: params.limit,
        });
        return {
          content: [
            {
              type: "text",
              text: buildSummaryText(graph, params.profileId),
            },
          ],
          structuredContent: graph,
        };
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
    },
  );
}
