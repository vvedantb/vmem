import { tool, type ToolSet } from "ai";
import type { ActionCtx } from "../_generated/server";
import {
  codebaseContextSchema,
  codebaseGraphSchema,
  codebaseImpactSchema,
  codebaseOverviewSchema,
  codebaseSearchSchema,
  codebasesListSchema,
  listProfilesSchema,
  memoryAddInstructionSchema,
  memoryAddSchema,
  memoryDeleteSchema,
  memoryRelatedSchema,
  memoryRetrieveSchema,
  memorySearchSchema,
  memoryUpdateSchema,
  pingSchema,
  setActiveProfileSchema,
  skillsCreateSchema,
  skillsDeleteSchema,
  skillsGetSchema,
  skillsListSchema,
  skillsUpdateSchema,
  whoamiSchema,
  wikiCreateSchema,
  wikiDeleteSchema,
  wikiGetSchema,
  wikiListSchema,
  wikiSearchSchema,
  wikiUpdateSchema,
} from "../mcp/schemas";
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
  type ToolHandlerResult,
} from "../mcp/toolHandlers";
import { MemoryRefCollector } from "./memoryRefCollector";

async function executeToolResult(
  toolName: string,
  collector: MemoryRefCollector,
  run: () => Promise<ToolHandlerResult>,
): Promise<string> {
  const result = await run();
  if (result.ok) {
    collector.collectFromTool(toolName, result.data);
  }
  return formatToolResult(result);
}

export function buildOpenRouterTools(
  ctx: ActionCtx,
  clerkUserId: string,
  collector: MemoryRefCollector,
): ToolSet {
  const handlerCtx: ToolHandlerContext = {
    ctx,
    clerkUserId,
    scope: "personal",
  };

  return {
    ping: tool({
      description: "Health check tool for connector validation.",
      inputSchema: pingSchema,
      execute: async () =>
        executeToolResult("ping", collector, () => runPing(handlerCtx)),
    }),
    whoami: tool({
      description:
        "Returns the authenticated user, active personal profile, and profiles visible on this personal MCP connector.",
      inputSchema: whoamiSchema,
      execute: async () =>
        executeToolResult("whoami", collector, () => runWhoami(handlerCtx)),
    }),
    list_profiles: tool({
      description:
        "List personal profiles available on this MCP connector. Returns profile IDs, names, colors, and icons.",
      inputSchema: listProfilesSchema,
      execute: async () =>
        executeToolResult("list_profiles", collector, () =>
          runListProfiles(handlerCtx),
        ),
    }),
    set_active_profile: tool({
      description:
        "Set the default personal profile for MCP memory tools when profileId is omitted.",
      inputSchema: setActiveProfileSchema,
      execute: async (input) =>
        executeToolResult("set_active_profile", collector, () =>
          runSetActiveProfile(handlerCtx, input),
        ),
    }),
    memory_search: tool({
      description: "Search your memories by query text, type, tags, or source.",
      inputSchema: memorySearchSchema,
      execute: async (input) =>
        executeToolResult("memory_search", collector, () =>
          runMemorySearch(handlerCtx, input),
        ),
    }),
    memory_retrieve: tool({
      description:
        "Retrieve the most relevant memories for a natural language query with score breakdown.",
      inputSchema: memoryRetrieveSchema,
      execute: async (input) =>
        executeToolResult("memory_retrieve", collector, () =>
          runMemoryRetrieve(handlerCtx, input),
        ),
    }),
    memory_add: tool({
      description: "Store a new memory (profile, episodic, or knowledge type).",
      inputSchema: memoryAddSchema,
      execute: async (input) =>
        executeToolResult("memory_add", collector, () =>
          runMemoryAdd(handlerCtx, input),
        ),
    }),
    memory_add_instruction: tool({
      description:
        "Store memories from a natural-language instruction (requires OpenRouter).",
      inputSchema: memoryAddInstructionSchema,
      execute: async (input) =>
        executeToolResult("memory_add_instruction", collector, () =>
          runMemoryAddInstruction(handlerCtx, input),
        ),
    }),
    memory_update: tool({
      description: "Update an existing memory by ID.",
      inputSchema: memoryUpdateSchema,
      execute: async (input) =>
        executeToolResult("memory_update", collector, () =>
          runMemoryUpdate(handlerCtx, input),
        ),
    }),
    memory_delete: tool({
      description: "Delete a memory by ID. This is permanent.",
      inputSchema: memoryDeleteSchema,
      execute: async (input) =>
        executeToolResult("memory_delete", collector, () =>
          runMemoryDelete(handlerCtx, input),
        ),
    }),
    memory_related: tool({
      description:
        "List memories linked to a given memory via RELATES_TO edges.",
      inputSchema: memoryRelatedSchema,
      execute: async (input) =>
        executeToolResult("memory_related", collector, () =>
          runMemoryRelated(handlerCtx, input),
        ),
    }),
    skills_list: tool({
      description: "List enabled skills (name + description only).",
      inputSchema: skillsListSchema,
      execute: async () =>
        executeToolResult("skills_list", collector, () =>
          runSkillsList(handlerCtx),
        ),
    }),
    skills_get: tool({
      description: "Fetch a single enabled skill by exact name.",
      inputSchema: skillsGetSchema,
      execute: async (input) =>
        executeToolResult("skills_get", collector, () =>
          runSkillsGet(handlerCtx, input),
        ),
    }),
    skills_create: tool({
      description: "Create a new enabled skill for a repeatable workflow.",
      inputSchema: skillsCreateSchema,
      execute: async (input) =>
        executeToolResult("skills_create", collector, () =>
          runSkillsCreate(handlerCtx, input),
        ),
    }),
    skills_update: tool({
      description: "Update an existing skill by exact name.",
      inputSchema: skillsUpdateSchema,
      execute: async (input) =>
        executeToolResult("skills_update", collector, () =>
          runSkillsUpdate(handlerCtx, input),
        ),
    }),
    skills_delete: tool({
      description: "Permanently delete a skill by exact name.",
      inputSchema: skillsDeleteSchema,
      execute: async (input) =>
        executeToolResult("skills_delete", collector, () =>
          runSkillsDelete(handlerCtx, input),
        ),
    }),
    wiki_list: tool({
      description: "List all wiki folders and documents.",
      inputSchema: wikiListSchema,
      execute: async () =>
        executeToolResult("wiki_list", collector, () =>
          runWikiList(handlerCtx),
        ),
    }),
    wiki_get: tool({
      description: "Fetch a single wiki node by id.",
      inputSchema: wikiGetSchema,
      execute: async (input) =>
        executeToolResult("wiki_get", collector, () =>
          runWikiGet(handlerCtx, input),
        ),
    }),
    wiki_search: tool({
      description: "Full-text search wiki titles and document bodies.",
      inputSchema: wikiSearchSchema,
      execute: async (input) =>
        executeToolResult("wiki_search", collector, () =>
          runWikiSearch(handlerCtx, input),
        ),
    }),
    wiki_create: tool({
      description: "Create a wiki folder or document.",
      inputSchema: wikiCreateSchema,
      execute: async (input) =>
        executeToolResult("wiki_create", collector, () =>
          runWikiCreate(handlerCtx, input),
        ),
    }),
    wiki_update: tool({
      description: "Update a wiki node by id.",
      inputSchema: wikiUpdateSchema,
      execute: async (input) =>
        executeToolResult("wiki_update", collector, () =>
          runWikiUpdate(handlerCtx, input),
        ),
    }),
    wiki_delete: tool({
      description: "Permanently delete a wiki folder or document by id.",
      inputSchema: wikiDeleteSchema,
      execute: async (input) =>
        executeToolResult("wiki_delete", collector, () =>
          runWikiDelete(handlerCtx, input),
        ),
    }),
    codebases_list: tool({
      description: "List GitHub repositories connected to vmem.",
      inputSchema: codebasesListSchema,
      execute: async () =>
        executeToolResult("codebases_list", collector, () =>
          runCodebasesList(handlerCtx),
        ),
    }),
    codebase_overview: tool({
      description: "Get aggregate stats for a synced codebase.",
      inputSchema: codebaseOverviewSchema,
      execute: async (input) =>
        executeToolResult("codebase_overview", collector, () =>
          runCodebaseOverview(handlerCtx, input),
        ),
    }),
    codebase_search: tool({
      description: "Search symbols inside a synced codebase.",
      inputSchema: codebaseSearchSchema,
      execute: async (input) =>
        executeToolResult("codebase_search", collector, () =>
          runCodebaseSearch(handlerCtx, input),
        ),
    }),
    codebase_context: tool({
      description: "Get a symbol's metadata plus CALLS relationships.",
      inputSchema: codebaseContextSchema,
      execute: async (input) =>
        executeToolResult("codebase_context", collector, () =>
          runCodebaseContext(handlerCtx, input),
        ),
    }),
    codebase_impact: tool({
      description: "Traverse CALLS edges upstream or downstream from a symbol.",
      inputSchema: codebaseImpactSchema,
      execute: async (input) =>
        executeToolResult("codebase_impact", collector, () =>
          runCodebaseImpact(handlerCtx, input),
        ),
    }),
    codebase_graph: tool({
      description: "Fetch a filtered subgraph of a synced codebase.",
      inputSchema: codebaseGraphSchema,
      execute: async (input) =>
        executeToolResult("codebase_graph", collector, () =>
          runCodebaseGraph(handlerCtx, input),
        ),
    }),
  };
}
