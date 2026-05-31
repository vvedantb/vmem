import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ActionCtx } from "../_generated/server";
import type { McpScope } from "../profiles/mcpAccess";
import {
  codebaseContextSchema,
  codebaseGraphSchema,
  codebaseImpactSchema,
  codebaseOverviewSchema,
  codebaseSearchSchema,
  listProfilesSchema,
  memoryAddInstructionSchema,
  memoryAddSchema,
  memoryDeleteSchema,
  memoryRelatedSchema,
  memoryRetrieveSchema,
  memorySearchSchema,
  memoryUpdateSchema,
  setActiveProfileSchema,
  skillsCreateSchema,
  skillsDeleteSchema,
  skillsGetSchema,
  skillsUpdateSchema,
  wikiCreateSchema,
  wikiDeleteSchema,
  wikiGetSchema,
  wikiSearchSchema,
  wikiUpdateSchema,
} from "./schemas";
import {
  formatToolResult,
  runCodebaseContext,
  runCodebaseGraph,
  runCodebaseImpact,
  runCodebaseOverview,
  runCodebaseSearch,
  runCodebasesList,
  runListProfiles,
  runMemoryAdd,
  runMemoryAddInstruction,
  runMemoryDelete,
  runMemoryRelated,
  runMemoryRetrieve,
  runMemorySearch,
  runMemoryUpdate,
  runPing,
  runSetActiveProfile,
  runSkillsCreate,
  runSkillsDelete,
  runSkillsGet,
  runSkillsList,
  runSkillsUpdate,
  runWhoami,
  runWikiCreate,
  runWikiDelete,
  runWikiGet,
  runWikiList,
  runWikiSearch,
  runWikiUpdate,
  type ToolHandlerContext,
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

export function registerTools(
  server: McpServer,
  clerkUserId: string,
  ctx: ActionCtx,
  scope: McpScope,
): void {
  const scopeLabel = scope === "team" ? "team" : "personal";
  const h = handlerContext(clerkUserId, ctx, scope);

  server.tool(
    "ping",
    "Health check tool for connector validation.",
    {},
    async () => textContent(formatToolResult(await runPing(h))),
  );

  server.tool(
    "whoami",
    `Returns the authenticated user, active ${scopeLabel} profile, and profiles visible on this ${scopeLabel} MCP connector.`,
    {},
    async () => {
      const result = await runWhoami(h);
      if (!result.ok) return errorContent(`Whoami failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "list_profiles",
    `List ${scopeLabel} profiles available on this MCP connector. Returns profile IDs, names, colors, and icons. Use set_active_profile to choose the default profile for memory tools, or pass profileId on memory_add / memory_search / memory_retrieve.`,
    {},
    async () => {
      const result = await runListProfiles(h);
      if (!result.ok) {
        return errorContent(`List profiles failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "set_active_profile",
    `Set the default ${scopeLabel} profile for MCP memory tools (memory_add, memory_search, memory_retrieve when profileId is omitted). Call list_profiles first to get valid profile IDs.`,
    setActiveProfileSchema.shape,
    async (params) => {
      const result = await runSetActiveProfile(h, params);
      if (!result.ok) {
        return errorContent(`Set active profile failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "memory_search",
    "Search your memories by query text, type, tags, or source. Returns matching memories with metadata. Defaults to the active profile unless profileId is specified.",
    memorySearchSchema.shape,
    async (params) => {
      const result = await runMemorySearch(h, params);
      if (!result.ok) return errorContent(`Search failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "memory_retrieve",
    "Retrieve the most relevant memories for a natural language query. Returns scored results with Context Trace explaining WHY each memory matched (score breakdown: fulltext, recency, confidence). Defaults to the active profile unless profileId is specified.",
    memoryRetrieveSchema.shape,
    async (params) => {
      const result = await runMemoryRetrieve(h, params);
      if (!result.ok) return errorContent(`Retrieve failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "memory_add",
    "Store a new memory. Use type 'profile' for stable user facts, 'episodic' for past events/interactions, 'knowledge' for durable extracted knowledge. Adds to the active profile unless profileId is specified.",
    memoryAddSchema.shape,
    async (params) => {
      const result = await runMemoryAdd(h, params);
      if (!result.ok) return errorContent(`Add memory failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "memory_add_instruction",
    "Store memories from a natural-language instruction. The server extracts atomic facts with an LLM and creates one memory per fact (requires OpenRouter). Use when the agent should remember a conversation summary without drafting title/content itself. Prefer memory_add when you already have a single clear fact with title and type.",
    memoryAddInstructionSchema.shape,
    async (params) => {
      const result = await runMemoryAddInstruction(h, params);
      if (!result.ok) {
        return errorContent(`Add from instruction failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "memory_update",
    "Update an existing memory by ID. Only include fields you want to change.",
    memoryUpdateSchema.shape,
    async (params) => {
      const result = await runMemoryUpdate(h, params);
      if (!result.ok) return errorContent(`Update failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "memory_delete",
    "Delete a memory by ID. This is permanent.",
    memoryDeleteSchema.shape,
    async (params) => {
      const result = await runMemoryDelete(h, params);
      if (!result.ok) return errorContent(`Delete failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "memory_related",
    "List memories explicitly linked to a given memory via RELATES_TO edges (1-hop). Returns full memory bodies plus linkReason for each edge. Use after memory_retrieve when you need all structural neighbors of one memory, not query-ranked top-k.",
    memoryRelatedSchema.shape,
    async (params) => {
      const result = await runMemoryRelated(h, params);
      if (!result.ok) {
        return errorContent(`Related memories failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "skills_list",
    "List enabled skills (name + description only). The skills index is also in the vmem://context_prompt resource — check there first. When a task matches a skill's description, call skills_get with the exact name to load full markdown instructions before following them. Before skills_create, confirm no listed skill already covers the workflow.",
    {},
    async () => {
      const result = await runSkillsList(h);
      if (!result.ok)
        return errorContent(`List skills failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "skills_get",
    "Fetch a single enabled skill by exact name, including full markdown instructions. Call this after identifying a matching skill from the Available Skills section in vmem://context_prompt or from skills_list.",
    skillsGetSchema.shape,
    async (params) => {
      const result = await runSkillsGet(h, params);
      if (!result.ok) return errorContent(`Get skill failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "skills_create",
    "Create a new enabled skill when you have identified a repeatable problem or a workflow that could be automated with a skill, and no existing skill already covers it (check Available Skills in vmem://context_prompt or call skills_list first). Write markdown instructions so future sessions can follow the same fix or automation. Do not create duplicates — if a similar skill exists, use skills_get and skills_update instead. Names must be unique per user (trimmed).",
    skillsCreateSchema.shape,
    async (params) => {
      const result = await runSkillsCreate(h, params);
      if (!result.ok) {
        return errorContent(`Create skill failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "skills_update",
    "Update an existing skill when its playbook should change — e.g. after fixing a repeatable problem, refining steps, or improving an automation. Call skills_get first to read the current skill. Provide the skill's current exact name (case sensitive) plus at least one field to change. Use newName to rename; use enabled false to disable without deleting.",
    skillsUpdateSchema.shape,
    async (params) => {
      const result = await runSkillsUpdate(h, params);
      if (!result.ok) {
        return errorContent(`Update skill failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "skills_delete",
    "Permanently delete a skill by exact name (case sensitive). Call skills_get first if unsure of the name. Prefer skills_update with enabled false to hide a skill without deleting it.",
    skillsDeleteSchema.shape,
    async (params) => {
      const result = await runSkillsDelete(h, params);
      if (!result.ok) {
        return errorContent(`Delete skill failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "wiki_list",
    "List all wiki folders and documents (flat index, no body). Use returned ids with wiki_get. Call this before wiki_get or wiki_update when you do not already have a node id.",
    {},
    async () => {
      const result = await runWikiList(h);
      if (!result.ok) return errorContent(`Wiki list failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "wiki_get",
    "Fetch a single wiki node by id. Returns metadata and contentMarkdown for documents. Call wiki_list first if you do not have the id.",
    wikiGetSchema.shape,
    async (params) => {
      const result = await runWikiGet(h, params);
      if (!result.ok) return errorContent(`Wiki get failed: ${result.error}`);
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "wiki_search",
    "Full-text search wiki titles and document bodies. Returns id, title, kind, and excerpt.",
    wikiSearchSchema.shape,
    async (params) => {
      const result = await runWikiSearch(h, params);
      if (!result.ok) {
        return errorContent(`Wiki search failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "wiki_create",
    "Create a wiki folder or document. Documents accept contentMarkdown stored as canonical markdown (same as the web editor). Optional parentId must be a folder id from wiki_list.",
    wikiCreateSchema.shape,
    async (params) => {
      const result = await runWikiCreate(h, params);
      if (!result.ok) {
        return errorContent(`Wiki create failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "wiki_update",
    "Update a wiki node by id. Optional title and/or contentMarkdown. contentMode append concatenates new markdown after existing body; replace (default) overwrites the body.",
    wikiUpdateSchema.shape,
    async (params) => {
      const result = await runWikiUpdate(h, params);
      if (!result.ok) {
        return errorContent(`Wiki update failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "wiki_delete",
    "Permanently delete a wiki folder or document by id. Deleting a folder removes all descendants. Call wiki_list or wiki_get first to confirm the id.",
    wikiDeleteSchema.shape,
    async (params) => {
      const result = await runWikiDelete(h, params);
      if (!result.ok) {
        return errorContent(`Wiki delete failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "codebases_list",
    "List GitHub repositories connected to vmem. Returns codebase IDs, repo names, sync status, and parser stats. Call this first to discover codebaseId values for the other codebase_* tools. Only repos with status 'synced' have graph data in Neo4j.",
    {},
    async () => {
      const result = await runCodebasesList(h);
      if (!result.ok) {
        return errorContent(`List codebases failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "codebase_overview",
    "Get aggregate stats for a synced codebase: file, function, class, interface, and process counts plus CALLS and IMPORTS edge counts.",
    codebaseOverviewSchema.shape,
    async (params) => {
      const result = await runCodebaseOverview(h, params);
      if (!result.ok) {
        return errorContent(`Codebase overview failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "codebase_search",
    "Search symbols (files, functions, classes, interfaces, processes) inside a synced codebase. Use the returned symbol id with codebase_context or codebase_impact.",
    codebaseSearchSchema.shape,
    async (params) => {
      const result = await runCodebaseSearch(h, params);
      if (!result.ok) {
        return errorContent(`Codebase search failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "codebase_context",
    "Get a symbol's metadata plus its direct CALLS relationships (callers and callees) and linked processes.",
    codebaseContextSchema.shape,
    async (params) => {
      const result = await runCodebaseContext(h, params);
      if (!result.ok) {
        return errorContent(`Codebase context failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "codebase_impact",
    "Traverse CALLS edges upstream (callers) or downstream (callees) from a symbol to estimate blast radius.",
    codebaseImpactSchema.shape,
    async (params) => {
      const result = await runCodebaseImpact(h, params);
      if (!result.ok) {
        return errorContent(`Codebase impact failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );

  server.tool(
    "codebase_graph",
    "Fetch a filtered subgraph of a synced codebase: nodes plus relationship edges (imports, calls, contains, extends, implements, process links). Response may be truncated on large repos — use kinds, processId, or blastRadiusOf to narrow scope.",
    codebaseGraphSchema.shape,
    async (params) => {
      const result = await runCodebaseGraph(h, params);
      if (!result.ok) {
        return errorContent(`Codebase graph failed: ${result.error}`);
      }
      return textContent(formatToolResult(result));
    },
  );
}
