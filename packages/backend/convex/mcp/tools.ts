import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

const memoryTypeSchema = z.enum(["profile", "episodic", "knowledge"]);
const memoryStatusSchema = z.enum([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

const codebaseSymbolKindSchema = z.enum([
  "code-file",
  "code-function",
  "code-class",
  "code-interface",
  "code-process",
]);

const codebaseImpactDirectionSchema = z.enum(["upstream", "downstream"]);

function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function jsonText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Wrap an internal-action call so any thrown error becomes an `isError`
 * tool result rather than crashing the MCP request. Mirrors the legacy
 * Express server's per-tool try/catch, just colocated here.
 */
async function safe<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[MCP][${label}]`, message);
    return { ok: false, message };
  }
}

export function registerTools(
  server: McpServer,
  clerkUserId: string,
  ctx: ActionCtx,
): void {
  server.tool(
    "ping",
    "Health check tool for connector validation.",
    {},
    async () => {
      return textContent(
        JSON.stringify({ ok: true, timestamp: new Date().toISOString() }),
      );
    },
  );

  server.tool(
    "whoami",
    "Returns the authenticated user ID and active profile for the current session.",
    {},
    async () => {
      const result = await safe("whoami", () =>
        ctx.runAction(internal.mcpProfiles.mcpWhoami, { clerkId: clerkUserId }),
      );
      if (!result.ok) return errorContent(`Whoami failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "list_profiles",
    "List all profiles available to the user. Returns profile IDs, names, colors, and icons. Use a profile ID with memory_add to save to a specific profile. Ask the user which profile they want to use before saving.",
    {},
    async () => {
      const result = await safe("list_profiles", () =>
        ctx.runAction(internal.mcpProfiles.mcpListProfiles, {
          clerkId: clerkUserId,
        }),
      );
      if (!result.ok)
        return errorContent(`List profiles failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "memory_search",
    "Search your memories by query text, type, tags, or source. Returns matching memories with metadata. Defaults to the active profile unless profileId is specified.",
    {
      query: z.string().optional().describe("Text to search for"),
      type: memoryTypeSchema.optional().describe("Filter by memory type"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      source: z.string().optional().describe("Filter by source"),
      profileId: z
        .string()
        .optional()
        .describe("Profile ID to search in (defaults to active profile)"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results (default 20)"),
      offset: z
        .number()
        .min(0)
        .optional()
        .describe("Offset for pagination (default 0)"),
    },
    async (params) => {
      const result = await safe("memory_search", () =>
        ctx.runAction(internal.neo4jActions.mcp.mcpSearchMemories, {
          clerkId: clerkUserId,
          query: params.query,
          type: params.type,
          tags: params.tags,
          limit: params.limit,
          offset: params.offset,
          profileId: params.profileId,
        }),
      );
      if (!result.ok) return errorContent(`Search failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "memory_retrieve",
    "Retrieve the most relevant memories for a natural language query. Returns scored results with Context Trace explaining WHY each memory matched (score breakdown: fulltext, recency, confidence). Defaults to the active profile unless profileId is specified.",
    {
      query: z
        .string()
        .describe("Natural language query to find relevant memories"),
      type: memoryTypeSchema.optional().describe("Filter by memory type"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      profileId: z
        .string()
        .optional()
        .describe("Profile ID to search in (defaults to active profile)"),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default 5)"),
    },
    async (params) => {
      const result = await safe("memory_retrieve", () =>
        ctx.runAction(internal.neo4jActions.mcp.mcpRetrieveMemories, {
          clerkId: clerkUserId,
          query: params.query,
          limit: params.limit,
          profileId: params.profileId,
        }),
      );
      if (!result.ok) return errorContent(`Retrieve failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "memory_add",
    "Store a new memory. Use type 'profile' for stable user facts, 'episodic' for past events/interactions, 'knowledge' for durable extracted knowledge. Adds to the active profile unless profileId is specified.",
    {
      title: z.string().describe("Short title for the memory"),
      content: z.string().describe("The memory content"),
      type: memoryTypeSchema.describe(
        "Memory type: profile, episodic, or knowledge",
      ),
      source: z
        .string()
        .describe(
          "Where this memory came from (e.g. 'claude', 'chatgpt', 'manual')",
        ),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Confidence score 0-1 (default 1.0)"),
      profileId: z
        .string()
        .optional()
        .describe("Profile ID to add memory to (defaults to active profile)"),
    },
    async (params) => {
      const result = await safe("memory_add", () =>
        ctx.runAction(internal.neo4jActions.mcp.mcpCreateMemory, {
          clerkId: clerkUserId,
          title: params.title,
          content: params.content,
          type: params.type,
          source: params.source,
          tags: params.tags,
          confidence: params.confidence,
          profileId: params.profileId,
        }),
      );
      if (!result.ok)
        return errorContent(`Add memory failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "memory_update",
    "Update an existing memory by ID. Only include fields you want to change.",
    {
      id: z.string().describe("Memory ID to update"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New content"),
      type: memoryTypeSchema.optional().describe("New type"),
      status: memoryStatusSchema
        .optional()
        .describe("New status: active, pinned, suppressed, expired"),
      tags: z.array(z.string()).optional().describe("New tags (replaces all)"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("New confidence score"),
    },
    async (params) => {
      const result = await safe("memory_update", () =>
        ctx.runAction(internal.neo4jActions.mcp.mcpUpdateMemory, {
          clerkId: clerkUserId,
          memoryId: params.id,
          title: params.title,
          content: params.content,
          type: params.type,
          status: params.status,
          tags: params.tags,
          confidence: params.confidence,
        }),
      );
      if (!result.ok) return errorContent(`Update failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "memory_delete",
    "Delete a memory by ID. This is permanent.",
    {
      id: z.string().describe("Memory ID to delete"),
    },
    async (params) => {
      const result = await safe("memory_delete", () =>
        ctx.runAction(internal.neo4jActions.mcp.mcpDeleteMemory, {
          clerkId: clerkUserId,
          memoryId: params.id,
        }),
      );
      if (!result.ok) return errorContent(`Delete failed: ${result.message}`);
      return textContent(jsonText({ deleted: result.value }));
    },
  );

  server.tool(
    "skills_list",
    "List all skills authored by the authenticated user. A skill is a reusable instruction module (name, description, markdown instructions) that the agent can consult. Returns the full list so you can decide which skill to apply.",
    {},
    async () => {
      const result = await safe("skills_list", () =>
        ctx.runAction(internal.mcpSkills.mcpListSkills, {
          clerkId: clerkUserId,
        }),
      );
      if (!result.ok)
        return errorContent(`List skills failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "skills_get",
    "Fetch a single skill by its exact name. Returns the full skill including its markdown instructions so you can follow them.",
    {
      name: z.string().describe("Exact skill name (case sensitive)"),
    },
    async (params) => {
      const result = await safe("skills_get", () =>
        ctx.runAction(internal.mcpSkills.mcpGetSkill, {
          clerkId: clerkUserId,
          name: params.name,
        }),
      );
      if (!result.ok)
        return errorContent(`Get skill failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "codebases_list",
    "List GitHub repositories connected to vmem. Returns codebase IDs, repo names, sync status, and parser stats. Call this first to discover codebaseId values for the other codebase_* tools. Only repos with status 'synced' have graph data in Neo4j.",
    {},
    async () => {
      const result = await safe("codebases_list", () =>
        ctx.runAction(internal.mcpCodebases.mcpListCodebases, {
          clerkId: clerkUserId,
        }),
      );
      if (!result.ok)
        return errorContent(`List codebases failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "codebase_overview",
    "Get aggregate stats for a synced codebase: file, function, class, interface, and process counts plus CALLS and IMPORTS edge counts.",
    {
      codebaseId: z.string().describe("Codebase ID from codebases_list"),
    },
    async (params) => {
      const result = await safe("codebase_overview", () =>
        ctx.runAction(internal.mcpCodebases.mcpGetCodebaseOverview, {
          clerkId: clerkUserId,
          codebaseId: params.codebaseId,
        }),
      );
      if (!result.ok)
        return errorContent(`Codebase overview failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "codebase_search",
    "Search symbols (files, functions, classes, interfaces, processes) inside a synced codebase. Use the returned symbol id with codebase_context or codebase_impact.",
    {
      codebaseId: z.string().describe("Codebase ID from codebases_list"),
      query: z.string().describe("Search text (name, path, or qualified name)"),
      kind: codebaseSymbolKindSchema
        .optional()
        .describe("Optional symbol kind filter"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default 20)"),
    },
    async (params) => {
      const result = await safe("codebase_search", () =>
        ctx.runAction(internal.mcpCodebases.mcpSearchCodebaseSymbols, {
          clerkId: clerkUserId,
          codebaseId: params.codebaseId,
          query: params.query,
          kind: params.kind,
          limit: params.limit,
        }),
      );
      if (!result.ok)
        return errorContent(`Codebase search failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "codebase_context",
    "Get a symbol's metadata plus its direct CALLS relationships (callers and callees) and linked processes.",
    {
      codebaseId: z.string().describe("Codebase ID from codebases_list"),
      symbolId: z
        .string()
        .describe("Symbol id from codebase_search or codebase_graph"),
    },
    async (params) => {
      const result = await safe("codebase_context", () =>
        ctx.runAction(internal.mcpCodebases.mcpGetCodebaseSymbolContext, {
          clerkId: clerkUserId,
          codebaseId: params.codebaseId,
          symbolId: params.symbolId,
        }),
      );
      if (!result.ok)
        return errorContent(`Codebase context failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "codebase_impact",
    "Traverse CALLS edges upstream (callers) or downstream (callees) from a symbol to estimate blast radius.",
    {
      codebaseId: z.string().describe("Codebase ID from codebases_list"),
      symbolId: z.string().describe("Starting symbol id"),
      direction: codebaseImpactDirectionSchema.describe(
        "upstream = who calls this symbol; downstream = what this symbol calls",
      ),
      depth: z
        .number()
        .int()
        .min(1)
        .max(6)
        .optional()
        .describe("Hop depth (default 3)"),
    },
    async (params) => {
      const result = await safe("codebase_impact", () =>
        ctx.runAction(internal.mcpCodebases.mcpGetCodebaseImpact, {
          clerkId: clerkUserId,
          codebaseId: params.codebaseId,
          symbolId: params.symbolId,
          direction: params.direction,
          depth: params.depth,
        }),
      );
      if (!result.ok)
        return errorContent(`Codebase impact failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );

  server.tool(
    "codebase_graph",
    "Fetch a filtered subgraph of a synced codebase: nodes plus relationship edges (imports, calls, contains, extends, implements, process links). Response may be truncated on large repos — use kinds, processId, or blastRadiusOf to narrow scope.",
    {
      codebaseId: z.string().describe("Codebase ID from codebases_list"),
      kinds: z
        .array(codebaseSymbolKindSchema)
        .optional()
        .describe("Limit node kinds in the payload"),
      processId: z
        .string()
        .optional()
        .describe("Return only nodes/edges for one process"),
      blastRadiusOf: z
        .string()
        .optional()
        .describe("Center the graph on this symbol's blast radius"),
      blastDirection: codebaseImpactDirectionSchema
        .optional()
        .describe("Direction when blastRadiusOf is set"),
      blastDepth: z
        .number()
        .int()
        .min(1)
        .max(6)
        .optional()
        .describe("Hop depth when blastRadiusOf is set (default 2)"),
    },
    async (params) => {
      const result = await safe("codebase_graph", () =>
        ctx.runAction(internal.mcpCodebases.mcpGetCodebaseGraph, {
          clerkId: clerkUserId,
          codebaseId: params.codebaseId,
          kinds: params.kinds,
          processId: params.processId,
          blastRadiusOf: params.blastRadiusOf,
          blastDirection: params.blastDirection,
          blastDepth: params.blastDepth,
        }),
      );
      if (!result.ok)
        return errorContent(`Codebase graph failed: ${result.message}`);
      return textContent(jsonText(result.value));
    },
  );
}
