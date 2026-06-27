import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ActionCtx } from "../_generated/server";
import type { McpScope } from "../profiles/mcpAccess";
import { toolSpecs } from "./toolCatalog";
import {
  formatToolResult,
  type ToolHandlerContext,
  type ToolHandlerResult,
} from "./toolHandlers";

function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function handlerContext(
  clerkUserId: string,
  ctx: ActionCtx,
  scope: McpScope,
): ToolHandlerContext {
  return { ctx, clerkUserId, scope };
}

/**
 * The MCP-surface mechanic: map a structured handler result to MCP tool
 * content — `isError` + a `<label> failed: …` message on failure, otherwise
 * the JSON-formatted data. Kept non-generic so it stays clear of the MCP SDK's
 * schema-inference generics; each `server.tool` registration below keeps its
 * concrete schema type from the catalog.
 */
function toMcpContent(result: ToolHandlerResult, errorLabel: string) {
  if (!result.ok) return errorContent(`${errorLabel}: ${result.error}`);
  return textContent(formatToolResult(result));
}

/** JSON for a get-file result with the (large) base64 payload removed. */
function fileMetadataText(data: object): string {
  const clone: Record<string, unknown> = { ...data };
  delete clone.contentBase64;
  return JSON.stringify(clone, null, 2);
}

/**
 * files_get returns an MCP image content block when the file is an inlined
 * image so hosts (Claude, ChatGPT) render it directly, plus a text block with
 * the remaining metadata (path, size, downloadUrl). Other files fall back to
 * the standard JSON text content.
 */
function filesGetContent(result: ToolHandlerResult) {
  if (!result.ok) return errorContent(`Files get failed: ${result.error}`);
  const data = result.data;
  if (
    typeof data === "object" &&
    data !== null &&
    "contentBase64" in data &&
    typeof data.contentBase64 === "string" &&
    "mimeType" in data &&
    typeof data.mimeType === "string" &&
    data.mimeType.startsWith("image/")
  ) {
    return {
      content: [
        {
          type: "image" as const,
          data: data.contentBase64,
          mimeType: data.mimeType,
        },
        { type: "text" as const, text: fileMetadataText(data) },
      ],
    };
  }
  return textContent(formatToolResult(result));
}

/**
 * Register every vmem tool on the MCP server. Tool name, input schema, and
 * handler all come from the shared catalog (`toolCatalog.ts`); only the
 * MCP-surface presentation lives here — scope-aware descriptions and the
 * error label used by `toMcpContent`.
 */
export function registerTools(
  server: McpServer,
  clerkUserId: string,
  ctx: ActionCtx,
  scope: McpScope,
): void {
  const scopeLabel = scope === "team" ? "team" : "personal";
  const h = handlerContext(clerkUserId, ctx, scope);

  server.tool(
    toolSpecs.ping.name,
    "Health check tool for connector validation.",
    toolSpecs.ping.schema.shape,
    async (params) =>
      toMcpContent(await toolSpecs.ping.run(h, params), "Ping failed"),
  );

  server.tool(
    toolSpecs.whoami.name,
    `Returns the authenticated user, active ${scopeLabel} profile, and profiles visible on this ${scopeLabel} MCP connector.`,
    toolSpecs.whoami.schema.shape,
    async (params) =>
      toMcpContent(await toolSpecs.whoami.run(h, params), "Whoami failed"),
  );

  server.tool(
    toolSpecs.list_profiles.name,
    `List ${scopeLabel} profiles available on this MCP connector. Returns profile IDs, names, colors, and icons. Use set_active_profile to choose the default profile for memory tools, or pass profileId on memory_add / memory_search / memory_retrieve.`,
    toolSpecs.list_profiles.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.list_profiles.run(h, params),
        "List profiles failed",
      ),
  );

  server.tool(
    toolSpecs.set_active_profile.name,
    `Set the default ${scopeLabel} profile for MCP memory tools (memory_add, memory_search, memory_retrieve when profileId is omitted). Call list_profiles first to get valid profile IDs.`,
    toolSpecs.set_active_profile.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.set_active_profile.run(h, params),
        "Set active profile failed",
      ),
  );

  server.tool(
    toolSpecs.memory_search.name,
    "Search your memories by query text, type, tags, or source. Returns matching memories with metadata. Defaults to the active profile unless profileId is specified.",
    toolSpecs.memory_search.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.memory_search.run(h, params),
        "Search failed",
      ),
  );

  server.tool(
    toolSpecs.memory_retrieve.name,
    "memory_retrieve — RAG retrieval for a natural-language question about the user's memories. Call this tool directly by exact name; do NOT use tool_search (it often surfaces memory_related or profile tools instead). Returns scored results with Context Trace (fulltext, recency, confidence). Defaults to active profile unless profileId is set.",
    toolSpecs.memory_retrieve.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.memory_retrieve.run(h, params),
        "Retrieve failed",
      ),
  );

  server.tool(
    toolSpecs.memory_add.name,
    "Store a new memory. Use type 'profile' for stable user facts, 'episodic' for past events/interactions, 'knowledge' for durable extracted knowledge. Adds to the active profile unless profileId is specified.",
    toolSpecs.memory_add.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.memory_add.run(h, params),
        "Add memory failed",
      ),
  );

  server.tool(
    toolSpecs.memory_add_instruction.name,
    "Store memories from a natural-language instruction. The server extracts atomic facts with an LLM and creates one memory per fact (requires OpenRouter). Use when the agent should remember a conversation summary without drafting title/content itself. Prefer memory_add when you already have a single clear fact with title and type.",
    toolSpecs.memory_add_instruction.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.memory_add_instruction.run(h, params),
        "Add from instruction failed",
      ),
  );

  server.tool(
    toolSpecs.memory_update.name,
    "Update an existing memory by ID. Only include fields you want to change.",
    toolSpecs.memory_update.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.memory_update.run(h, params),
        "Update failed",
      ),
  );

  server.tool(
    toolSpecs.memory_delete.name,
    "Delete a memory by ID. This is permanent.",
    toolSpecs.memory_delete.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.memory_delete.run(h, params),
        "Delete failed",
      ),
  );

  server.tool(
    toolSpecs.memory_related.name,
    "List memories explicitly linked to a given memory via RELATES_TO edges (1-hop). Returns full memory bodies plus linkReason for each edge. Use after memory_retrieve when you need all structural neighbors of one memory, not query-ranked top-k.",
    toolSpecs.memory_related.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.memory_related.run(h, params),
        "Related memories failed",
      ),
  );

  server.tool(
    toolSpecs.skills_match_message.name,
    "Eager skill loader — call FIRST every user turn with the user's full message. Returns matched skill names and full markdown instructions (same as local chat auto-load). If instructionsMarkdown is non-empty, follow it exactly before any other tool or reply. Slash commands like /writeup and /teach-me are detected automatically.",
    toolSpecs.skills_match_message.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.skills_match_message.run(h, params),
        "Match skills for message failed",
      ),
  );

  server.tool(
    toolSpecs.skills_list.name,
    "List enabled skills (name + description only). The skills index is also in the vmem://context_prompt resource. Prefer skills_match_message each turn; use skills_get when you need one skill by exact name.",
    toolSpecs.skills_list.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.skills_list.run(h, params),
        "List skills failed",
      ),
  );

  server.tool(
    toolSpecs.skills_get.name,
    "Fetch a single enabled skill by exact name, including full markdown instructions. Prefer skills_match_message at turn start; use this when you already know the exact skill name.",
    toolSpecs.skills_get.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.skills_get.run(h, params),
        "Get skill failed",
      ),
  );

  server.tool(
    toolSpecs.skills_create.name,
    "Create a new enabled skill when you have identified a repeatable problem or a workflow that could be automated with a skill, and no existing skill already covers it (check Available Skills in vmem://context_prompt or call skills_list first). Write markdown instructions so future sessions can follow the same fix or automation. Do not create duplicates — if a similar skill exists, use skills_get and skills_update instead. Names must be unique per user (trimmed).",
    toolSpecs.skills_create.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.skills_create.run(h, params),
        "Create skill failed",
      ),
  );

  server.tool(
    toolSpecs.skills_update.name,
    "Update an existing skill when its playbook should change — e.g. after fixing a repeatable problem, refining steps, or improving an automation. Call skills_get first to read the current skill. Provide the skill's current exact name (case sensitive) plus at least one field to change. Use newName to rename; use enabled false to disable without deleting.",
    toolSpecs.skills_update.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.skills_update.run(h, params),
        "Update skill failed",
      ),
  );

  server.tool(
    toolSpecs.skills_delete.name,
    "Permanently delete a skill by exact name (case sensitive). Call skills_get first if unsure of the name. Prefer skills_update with enabled false to hide a skill without deleting it.",
    toolSpecs.skills_delete.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.skills_delete.run(h, params),
        "Delete skill failed",
      ),
  );

  server.tool(
    toolSpecs.wiki_list.name,
    "List all wiki folders and documents (flat index, no body). Use returned ids with wiki_get. Call this before wiki_get or wiki_update when you do not already have a node id.",
    toolSpecs.wiki_list.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.wiki_list.run(h, params),
        "Wiki list failed",
      ),
  );

  server.tool(
    toolSpecs.wiki_get.name,
    "Fetch a single wiki node by id. Returns metadata and contentMarkdown for documents. Call wiki_list first if you do not have the id.",
    toolSpecs.wiki_get.schema.shape,
    async (params) =>
      toMcpContent(await toolSpecs.wiki_get.run(h, params), "Wiki get failed"),
  );

  server.tool(
    toolSpecs.wiki_search.name,
    "Full-text search wiki titles and document bodies. Returns id, title, kind, and excerpt.",
    toolSpecs.wiki_search.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.wiki_search.run(h, params),
        "Wiki search failed",
      ),
  );

  server.tool(
    toolSpecs.wiki_create.name,
    "Create a wiki folder or document. Documents accept contentMarkdown stored as canonical markdown (same as the web editor). Optional parentId must be a folder id from wiki_list. For /writeup skill: create the full Learning/ explainer here BEFORE replying in chat (teaser only in chat).",
    toolSpecs.wiki_create.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.wiki_create.run(h, params),
        "Wiki create failed",
      ),
  );

  server.tool(
    toolSpecs.wiki_update.name,
    "Update a wiki node by id. Optional title and/or contentMarkdown. contentMode append concatenates new markdown after existing body; replace (default) overwrites the body.",
    toolSpecs.wiki_update.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.wiki_update.run(h, params),
        "Wiki update failed",
      ),
  );

  server.tool(
    toolSpecs.wiki_delete.name,
    "Permanently delete a wiki folder or document by id. Deleting a folder removes all descendants. Call wiki_list or wiki_get first to confirm the id.",
    toolSpecs.wiki_delete.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.wiki_delete.run(h, params),
        "Wiki delete failed",
      ),
  );

  server.tool(
    toolSpecs.files_list.name,
    "List files and folders in the shared filesystem. Paths are '/'-separated (e.g. 'ai-images/cat.png'). Omit path to list the entire tree; pass a folder path to list its direct children. Files are user-wide and shared across all your AI clients.",
    toolSpecs.files_list.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.files_list.run(h, params),
        "Files list failed",
      ),
  );

  server.tool(
    toolSpecs.files_get.name,
    "Read a file by path. Images up to 4 MB are returned as an inline image block (rendered directly); text files up to 100 KB are returned inline. A downloadUrl is always included for larger files. Call files_list first if you don't know the path.",
    toolSpecs.files_get.schema.shape,
    async (params) => filesGetContent(await toolSpecs.files_get.run(h, params)),
  );

  server.tool(
    toolSpecs.files_upload.name,
    "Save a file to the shared filesystem at the given path. Provide either contentBase64 (inline bytes, data: URL allowed) or sourceUrl (the server fetches and stores it — best for generated images). Missing parent folders are auto-created; an existing file at the path is overwritten. Max 10 MB. PDF and text-like files are automatically indexed into the memory graph and appear in memory_search/memory_retrieve.",
    toolSpecs.files_upload.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.files_upload.run(h, params),
        "Files upload failed",
      ),
  );

  server.tool(
    toolSpecs.files_delete.name,
    "Delete a file or folder by path. Folders are deleted recursively along with their stored contents. This is permanent.",
    toolSpecs.files_delete.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.files_delete.run(h, params),
        "Files delete failed",
      ),
  );

  server.tool(
    toolSpecs.codebases_list.name,
    "List GitHub repositories connected to vmem. Returns codebase IDs, repo names, sync status, and parser stats. Call this first to discover codebaseId values for the other codebase_* tools. Only repos with status 'synced' have graph data in Neo4j.",
    toolSpecs.codebases_list.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.codebases_list.run(h, params),
        "List codebases failed",
      ),
  );

  server.tool(
    toolSpecs.codebase_overview.name,
    "Get aggregate stats for a synced codebase: file, function, class, interface, and process counts plus CALLS and IMPORTS edge counts.",
    toolSpecs.codebase_overview.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.codebase_overview.run(h, params),
        "Codebase overview failed",
      ),
  );

  server.tool(
    toolSpecs.codebase_search.name,
    "Search symbols (files, functions, classes, interfaces, processes) inside a synced codebase. Use the returned symbol id with codebase_context or codebase_impact.",
    toolSpecs.codebase_search.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.codebase_search.run(h, params),
        "Codebase search failed",
      ),
  );

  server.tool(
    toolSpecs.codebase_context.name,
    "Get a symbol's metadata plus its direct CALLS relationships (callers and callees) and linked processes.",
    toolSpecs.codebase_context.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.codebase_context.run(h, params),
        "Codebase context failed",
      ),
  );

  server.tool(
    toolSpecs.codebase_impact.name,
    "Traverse CALLS edges upstream (callers) or downstream (callees) from a symbol to estimate blast radius.",
    toolSpecs.codebase_impact.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.codebase_impact.run(h, params),
        "Codebase impact failed",
      ),
  );

  server.tool(
    toolSpecs.codebase_graph.name,
    "Fetch a filtered subgraph of a synced codebase: nodes plus relationship edges (imports, calls, contains, extends, implements, process links). Response may be truncated on large repos — use kinds, processId, or blastRadiusOf to narrow scope.",
    toolSpecs.codebase_graph.schema.shape,
    async (params) =>
      toMcpContent(
        await toolSpecs.codebase_graph.run(h, params),
        "Codebase graph failed",
      ),
  );
}
