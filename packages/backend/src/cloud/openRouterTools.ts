// @ts-nocheck
import { type Tool, type ToolSet } from "ai";
import type { z } from "zod";
import type { ActionCtx } from "../../convex/_generated/server";
import { MemoryRefCollector } from "../../convex/chat/memoryRefCollector";
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
} from "../../convex/mcp/schemas";
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
} from "../../convex/mcp/toolHandlers";

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

function definePersonalTool<TSchema extends z.ZodTypeAny>(
  description: string,
  inputSchema: TSchema,
  execute: (input: z.infer<TSchema>) => Promise<string>,
): Tool {
  return {
    description,
    inputSchema,
    execute,
  };
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
    ping: definePersonalTool(
      "Health check tool for connector validation.",
      pingSchema,
      async () =>
        executeToolResult("ping", collector, () => runPing(handlerCtx)),
    ),
    whoami: definePersonalTool(
      "Returns the authenticated user, active personal profile, and profiles visible on this personal MCP connector.",
      whoamiSchema,
      async () =>
        executeToolResult("whoami", collector, () => runWhoami(handlerCtx)),
    ),
    list_profiles: definePersonalTool(
      "List personal profiles available on this MCP connector. Returns profile IDs, names, colors, and icons.",
      listProfilesSchema,
      async () =>
        executeToolResult("list_profiles", collector, () =>
          runListProfiles(handlerCtx),
        ),
    ),
    set_active_profile: definePersonalTool(
      "Set the default personal profile for MCP memory tools when profileId is omitted.",
      setActiveProfileSchema,
      async (input) =>
        executeToolResult("set_active_profile", collector, () =>
          runSetActiveProfile(handlerCtx, input),
        ),
    ),
    memory_search: definePersonalTool(
      "Search your memories by query text, type, tags, or source.",
      memorySearchSchema,
      async (input) =>
        executeToolResult("memory_search", collector, () =>
          runMemorySearch(handlerCtx, input),
        ),
    ),
    memory_retrieve: definePersonalTool(
      "Retrieve the most relevant memories for a natural language query with score breakdown.",
      memoryRetrieveSchema,
      async (input) =>
        executeToolResult("memory_retrieve", collector, () =>
          runMemoryRetrieve(handlerCtx, input),
        ),
    ),
    memory_add: definePersonalTool(
      "Store a new memory (profile, episodic, or knowledge type).",
      memoryAddSchema,
      async (input) =>
        executeToolResult("memory_add", collector, () =>
          runMemoryAdd(handlerCtx, input),
        ),
    ),
    memory_add_instruction: definePersonalTool(
      "Store memories from a natural-language instruction (requires OpenRouter).",
      memoryAddInstructionSchema,
      async (input) =>
        executeToolResult("memory_add_instruction", collector, () =>
          runMemoryAddInstruction(handlerCtx, input),
        ),
    ),
    memory_update: definePersonalTool(
      "Update an existing memory by ID.",
      memoryUpdateSchema,
      async (input) =>
        executeToolResult("memory_update", collector, () =>
          runMemoryUpdate(handlerCtx, input),
        ),
    ),
    memory_delete: definePersonalTool(
      "Delete a memory by ID. This is permanent.",
      memoryDeleteSchema,
      async (input) =>
        executeToolResult("memory_delete", collector, () =>
          runMemoryDelete(handlerCtx, input),
        ),
    ),
    memory_related: definePersonalTool(
      "List memories linked to a given memory via RELATES_TO edges.",
      memoryRelatedSchema,
      async (input) =>
        executeToolResult("memory_related", collector, () =>
          runMemoryRelated(handlerCtx, input),
        ),
    ),
    skills_list: definePersonalTool(
      "List enabled skills (name + description only).",
      skillsListSchema,
      async () =>
        executeToolResult("skills_list", collector, () =>
          runSkillsList(handlerCtx),
        ),
    ),
    skills_get: definePersonalTool(
      "Fetch a single enabled skill by exact name.",
      skillsGetSchema,
      async (input) =>
        executeToolResult("skills_get", collector, () =>
          runSkillsGet(handlerCtx, input),
        ),
    ),
    skills_create: definePersonalTool(
      "Create a new enabled skill for a repeatable workflow.",
      skillsCreateSchema,
      async (input) =>
        executeToolResult("skills_create", collector, () =>
          runSkillsCreate(handlerCtx, input),
        ),
    ),
    skills_update: definePersonalTool(
      "Update an existing skill by exact name.",
      skillsUpdateSchema,
      async (input) =>
        executeToolResult("skills_update", collector, () =>
          runSkillsUpdate(handlerCtx, input),
        ),
    ),
    skills_delete: definePersonalTool(
      "Permanently delete a skill by exact name.",
      skillsDeleteSchema,
      async (input) =>
        executeToolResult("skills_delete", collector, () =>
          runSkillsDelete(handlerCtx, input),
        ),
    ),
    wiki_list: definePersonalTool(
      "List all wiki folders and documents.",
      wikiListSchema,
      async () =>
        executeToolResult("wiki_list", collector, () =>
          runWikiList(handlerCtx),
        ),
    ),
    wiki_get: definePersonalTool(
      "Fetch a single wiki node by id.",
      wikiGetSchema,
      async (input) =>
        executeToolResult("wiki_get", collector, () =>
          runWikiGet(handlerCtx, input),
        ),
    ),
    wiki_search: definePersonalTool(
      "Full-text search wiki titles and document bodies.",
      wikiSearchSchema,
      async (input) =>
        executeToolResult("wiki_search", collector, () =>
          runWikiSearch(handlerCtx, input),
        ),
    ),
    wiki_create: definePersonalTool(
      "Create a wiki folder or document.",
      wikiCreateSchema,
      async (input) =>
        executeToolResult("wiki_create", collector, () =>
          runWikiCreate(handlerCtx, input),
        ),
    ),
    wiki_update: definePersonalTool(
      "Update a wiki node by id.",
      wikiUpdateSchema,
      async (input) =>
        executeToolResult("wiki_update", collector, () =>
          runWikiUpdate(handlerCtx, input),
        ),
    ),
    wiki_delete: definePersonalTool(
      "Permanently delete a wiki folder or document by id.",
      wikiDeleteSchema,
      async (input) =>
        executeToolResult("wiki_delete", collector, () =>
          runWikiDelete(handlerCtx, input),
        ),
    ),
    codebases_list: definePersonalTool(
      "List GitHub repositories connected to vmem.",
      codebasesListSchema,
      async () =>
        executeToolResult("codebases_list", collector, () =>
          runCodebasesList(handlerCtx),
        ),
    ),
    codebase_overview: definePersonalTool(
      "Get aggregate stats for a synced codebase.",
      codebaseOverviewSchema,
      async (input) =>
        executeToolResult("codebase_overview", collector, () =>
          runCodebaseOverview(handlerCtx, input),
        ),
    ),
    codebase_search: definePersonalTool(
      "Search symbols inside a synced codebase.",
      codebaseSearchSchema,
      async (input) =>
        executeToolResult("codebase_search", collector, () =>
          runCodebaseSearch(handlerCtx, input),
        ),
    ),
    codebase_context: definePersonalTool(
      "Get a symbol's metadata plus CALLS relationships.",
      codebaseContextSchema,
      async (input) =>
        executeToolResult("codebase_context", collector, () =>
          runCodebaseContext(handlerCtx, input),
        ),
    ),
    codebase_impact: definePersonalTool(
      "Traverse CALLS edges upstream or downstream from a symbol.",
      codebaseImpactSchema,
      async (input) =>
        executeToolResult("codebase_impact", collector, () =>
          runCodebaseImpact(handlerCtx, input),
        ),
    ),
    codebase_graph: definePersonalTool(
      "Fetch a filtered subgraph of a synced codebase.",
      codebaseGraphSchema,
      async (input) =>
        executeToolResult("codebase_graph", collector, () =>
          runCodebaseGraph(handlerCtx, input),
        ),
    ),
  };
}
