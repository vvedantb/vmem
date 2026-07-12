import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ActionCtx } from "../_generated/server";
import type { McpScope } from "../profiles/mcpAccess";
import { bindToolSpec, toolSpecs, type McpBindableTool } from "./toolCatalog";
import {
  formatToolResult,
  type ToolHandlerContext,
  type ToolHandlerResult,
} from "./toolHandlers";

type McpToolContent = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
};

function textContent(text: string): McpToolContent {
  return { content: [{ type: "text", text }] };
}

function errorContent(message: string): McpToolContent {
  return {
    content: [{ type: "text", text: message }],
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
 * schema-inference generics; `registerMcpTool` below keeps each tool's
 * concrete schema type from the catalog.
 */
function toMcpContent(
  result: ToolHandlerResult,
  errorLabel: string,
): McpToolContent {
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
function filesGetContent(result: ToolHandlerResult): McpToolContent {
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
          type: "image",
          data: data.contentBase64,
          mimeType: data.mimeType,
        },
        { type: "text", text: fileMetadataText(data) },
      ],
    };
  }
  return textContent(formatToolResult(result));
}

type McpToolPresentation = {
  description: string | ((scopeLabel: string) => string);
  errorLabel: string;
  /** Omit to register on every MCP scope. */
  scopes?: readonly McpScope[];
  toContent?: (result: ToolHandlerResult) => McpToolContent;
};

/**
 * MCP presentation metadata per catalog tool — descriptions, error labels,
 * scope gating, and optional custom content mappers. Operational wiring
 * (name, schema, handler) stays in `toolCatalog.ts`.
 */
const mcpPresentation: Record<keyof typeof toolSpecs, McpToolPresentation> = {
  ping: {
    description: "Health check tool for connector validation.",
    errorLabel: "Ping failed",
  },
  whoami: {
    description: (scopeLabel) =>
      `Returns the authenticated user, active ${scopeLabel} profile, and profiles visible on this ${scopeLabel} MCP connector.`,
    errorLabel: "Whoami failed",
  },
  list_profiles: {
    description: (scopeLabel) =>
      `List ${scopeLabel} profiles available on this MCP connector. Returns profile IDs, names, colors, and icons. Use set_active_profile to choose the default profile for memory tools, or pass profileId on memory_add / memory_search / memory_retrieve.`,
    errorLabel: "List profiles failed",
  },
  set_active_profile: {
    description: (scopeLabel) =>
      `Set the default ${scopeLabel} profile for MCP memory tools (memory_add, memory_search, memory_retrieve when profileId is omitted). Call list_profiles first to get valid profile IDs.`,
    errorLabel: "Set active profile failed",
  },
  context_prompt_get: {
    description:
      "Returns the full vmem user profile markdown (same as MCP resource vmem://context_prompt): About, Preferences, pinned memories, profile summary, and Available Skills (name + description). Call at session start or when a skill might apply — claude.ai cannot re-read the resource mid-chat. Then call skills_get with the exact skill name to load the playbook.",
    errorLabel: "Context prompt get failed",
    scopes: ["personal"],
  },
  memory_search: {
    description:
      "Search your memories by query text, type, tags, or source. Returns matching memories with metadata. Defaults to the active profile unless profileId is specified.",
    errorLabel: "Search failed",
  },
  memory_retrieve: {
    description:
      "Retrieve the most relevant memories for a natural language query. Returns scored results with Context Trace explaining WHY each memory matched (score breakdown: fulltext, recency, confidence). Defaults to the active profile unless profileId is specified.",
    errorLabel: "Retrieve failed",
  },
  memory_add: {
    description:
      "Store a new memory. Use type 'profile' for stable user facts, 'episodic' for past events/interactions, 'knowledge' for durable extracted knowledge. Adds to the active profile unless profileId is specified.",
    errorLabel: "Add memory failed",
  },
  memory_add_instruction: {
    description:
      "Store memories from a natural-language instruction. The server extracts atomic facts with an LLM and creates one memory per fact (requires OpenRouter). Use when the agent should remember a conversation summary without drafting title/content itself. Prefer memory_add when you already have a single clear fact with title and type.",
    errorLabel: "Add from instruction failed",
  },
  memory_update: {
    description:
      "Update an existing memory by ID. Only include fields you want to change.",
    errorLabel: "Update failed",
  },
  memory_delete: {
    description: "Delete a memory by ID. This is permanent.",
    errorLabel: "Delete failed",
  },
  memory_related: {
    description:
      "List memories explicitly linked to a given memory via RELATES_TO edges (1-hop). Returns full memory bodies plus linkReason for each edge. Use after memory_retrieve when you need all structural neighbors of one memory, not query-ranked top-k.",
    errorLabel: "Related memories failed",
  },
  skills_list: {
    description:
      "List enabled skills (name + description only). Same data as the Available Skills section in context_prompt_get / vmem://context_prompt. When a task matches a skill's description, call skills_get with the exact name to load full markdown instructions before following them.",
    errorLabel: "List skills failed",
  },
  skills_get: {
    description:
      "Fetch a single enabled skill by exact name, including full markdown instructions. Call after identifying a matching skill from context_prompt_get, skills_list, or the Available Skills section in vmem://context_prompt.",
    errorLabel: "Get skill failed",
  },
  skills_create: {
    description:
      "Create a new enabled skill when you have identified a repeatable problem or a workflow that could be automated with a skill, and no existing skill already covers it (check Available Skills in vmem://context_prompt or call skills_list first). Write markdown instructions so future sessions can follow the same fix or automation. Do not create duplicates — if a similar skill exists, use skills_get and skills_update instead. Names must be unique per user (trimmed).",
    errorLabel: "Create skill failed",
  },
  skills_update: {
    description:
      "Update an existing skill when its playbook should change — e.g. after fixing a repeatable problem, refining steps, or improving an automation. Call skills_get first to read the current skill. Provide the skill's current exact name (case sensitive) plus at least one field to change. Use newName to rename; use enabled false to disable without deleting.",
    errorLabel: "Update skill failed",
  },
  skills_delete: {
    description:
      "Permanently delete a skill by exact name (case sensitive). Call skills_get first if unsure of the name. Prefer skills_update with enabled false to hide a skill without deleting it.",
    errorLabel: "Delete skill failed",
  },
  wiki_list: {
    description:
      "List all wiki folders and documents (flat index, no body). Use returned ids with wiki_get. Call this before wiki_get or wiki_update when you do not already have a node id.",
    errorLabel: "Wiki list failed",
  },
  wiki_get: {
    description:
      "Fetch a single wiki node by id. Returns metadata and contentMarkdown for documents. Call wiki_list first if you do not have the id.",
    errorLabel: "Wiki get failed",
  },
  wiki_search: {
    description:
      "Full-text search wiki titles and document bodies. Returns id, title, kind, and excerpt.",
    errorLabel: "Wiki search failed",
  },
  wiki_create: {
    description:
      "Create a wiki folder or document. Documents accept contentMarkdown stored as canonical markdown (same as the web editor). Optional parentId must be a folder id from wiki_list.",
    errorLabel: "Wiki create failed",
  },
  wiki_update: {
    description:
      "Update a wiki node by id. Optional title and/or contentMarkdown. contentMode append concatenates new markdown after existing body; replace (default) overwrites the body.",
    errorLabel: "Wiki update failed",
  },
  wiki_delete: {
    description:
      "Permanently delete a wiki folder or document by id. Deleting a folder removes all descendants. Call wiki_list or wiki_get first to confirm the id.",
    errorLabel: "Wiki delete failed",
  },
  files_list: {
    description:
      "List files and folders in the shared filesystem. Paths are '/'-separated (e.g. 'ai-images/cat.png'). Omit path to list the entire tree; pass a folder path to list its direct children. Files are user-wide and shared across all your AI clients.",
    errorLabel: "Files list failed",
  },
  files_get: {
    description:
      "Read a file by path. Images up to 4 MB are returned as an inline image block (rendered directly); text files up to 100 KB are returned inline. A downloadUrl is always included for larger files. Call files_list first if you don't know the path.",
    errorLabel: "Files get failed",
    toContent: filesGetContent,
  },
  files_upload: {
    description:
      "Save a file to the shared filesystem at the given path. Provide either contentBase64 (inline bytes, data: URL allowed) or sourceUrl (the server fetches and stores it — best for generated images). Missing parent folders are auto-created; an existing file at the path is overwritten. Max 10 MB. PDF and text-like files are automatically indexed into the memory graph and appear in memory_search/memory_retrieve.",
    errorLabel: "Files upload failed",
  },
  files_delete: {
    description:
      "Delete a file or folder by path. Folders are deleted recursively along with their stored contents. This is permanent.",
    errorLabel: "Files delete failed",
  },
  codebases_list: {
    description:
      "List GitHub repositories connected to vmem. Returns codebase IDs, repo names, sync status, and parser stats. Call this first to discover codebaseId values for the other codebase_* tools. Only repos with status 'synced' have graph data in Neo4j.",
    errorLabel: "List codebases failed",
  },
  codebase_overview: {
    description:
      "Get aggregate stats for a synced codebase: file, function, class, interface, and process counts plus CALLS and IMPORTS edge counts.",
    errorLabel: "Codebase overview failed",
  },
  codebase_search: {
    description:
      "Search symbols (files, functions, classes, interfaces, processes) inside a synced codebase. Use the returned symbol id with codebase_context or codebase_impact.",
    errorLabel: "Codebase search failed",
  },
  codebase_context: {
    description:
      "Get a symbol's metadata plus its direct CALLS relationships (callers and callees) and linked processes.",
    errorLabel: "Codebase context failed",
  },
  codebase_impact: {
    description:
      "Traverse CALLS edges upstream (callers) or downstream (callees) from a symbol to estimate blast radius.",
    errorLabel: "Codebase impact failed",
  },
  codebase_graph: {
    description:
      "Fetch a filtered subgraph of a synced codebase: nodes plus relationship edges (imports, calls, contains, extends, implements, process links). Response may be truncated on large repos — use kinds, processId, or blastRadiusOf to narrow scope.",
    errorLabel: "Codebase graph failed",
  },
};

/** Registration order mirrors insertion order of `toolSpecs` (toolCatalog.ts). */
const bindableToolSpecs: Record<keyof typeof toolSpecs, McpBindableTool> =
  Object.fromEntries(
    Object.entries(toolSpecs).map(([key, spec]) => [
      key,
      // Catalog union loses per-tool Shape in a loop; runtime is safe via schema.parse.
      // @ts-expect-error TS2345 — union ToolSpec in keyed loop
      bindToolSpec(spec),
    ]),
  ) as Record<keyof typeof toolSpecs, McpBindableTool>;

function registerMcpTool(
  server: McpServer,
  spec: McpBindableTool,
  meta: McpToolPresentation,
  scopeLabel: string,
  scope: McpScope,
  h: ToolHandlerContext,
): void {
  if (meta.scopes && !meta.scopes.includes(scope)) return;

  const description =
    typeof meta.description === "function"
      ? meta.description(scopeLabel)
      : meta.description;
  const toContent: (result: ToolHandlerResult) => McpToolContent =
    meta.toContent ?? ((result) => toMcpContent(result, meta.errorLabel));

  server.tool(spec.name, description, spec.schema.shape, async (params) =>
    toContent(await spec.run(h, params)),
  );
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

  for (const key of Object.keys(toolSpecs) as Array<keyof typeof toolSpecs>) {
    registerMcpTool(
      server,
      bindableToolSpecs[key],
      mcpPresentation[key],
      scopeLabel,
      scope,
      h,
    );
  }
}
