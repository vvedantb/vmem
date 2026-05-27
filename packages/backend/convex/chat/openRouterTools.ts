import { tool, type ToolSet } from "ai";
import type { z } from "zod";
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

function definePersonalTool<T extends z.ZodType>(
  definition: {
    name: string;
    description: string;
    inputSchema: T;
    run: (
      ctx: ToolHandlerContext,
      input: z.infer<T>,
    ) => Promise<ToolHandlerResult>;
  },
  handlerCtx: ToolHandlerContext,
  collector: MemoryRefCollector,
): [string, ReturnType<typeof tool>] {
  return [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: async (input) => {
        const result = await definition.run(handlerCtx, input);
        if (result.ok) {
          collector.collectFromTool(definition.name, result.data);
        }
        return formatToolResult(result);
      },
    }),
  ];
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

  const entries = [
    definePersonalTool(
      {
        name: "ping",
        description: "Health check tool for connector validation.",
        inputSchema: pingSchema,
        run: (toolCtx) => runPing(toolCtx),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "whoami",
        description:
          "Returns the authenticated user, active personal profile, and profiles visible on this personal MCP connector.",
        inputSchema: whoamiSchema,
        run: (toolCtx) => runWhoami(toolCtx),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "list_profiles",
        description:
          "List personal profiles available on this MCP connector. Returns profile IDs, names, colors, and icons.",
        inputSchema: listProfilesSchema,
        run: (toolCtx) => runListProfiles(toolCtx),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "set_active_profile",
        description:
          "Set the default personal profile for MCP memory tools when profileId is omitted.",
        inputSchema: setActiveProfileSchema,
        run: (toolCtx, input) => runSetActiveProfile(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "memory_search",
        description:
          "Search your memories by query text, type, tags, or source.",
        inputSchema: memorySearchSchema,
        run: (toolCtx, input) => runMemorySearch(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "memory_retrieve",
        description:
          "Retrieve the most relevant memories for a natural language query with score breakdown.",
        inputSchema: memoryRetrieveSchema,
        run: (toolCtx, input) => runMemoryRetrieve(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "memory_add",
        description:
          "Store a new memory (profile, episodic, or knowledge type).",
        inputSchema: memoryAddSchema,
        run: (toolCtx, input) => runMemoryAdd(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "memory_add_instruction",
        description:
          "Store memories from a natural-language instruction (requires OpenRouter).",
        inputSchema: memoryAddInstructionSchema,
        run: (toolCtx, input) => runMemoryAddInstruction(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "memory_update",
        description: "Update an existing memory by ID.",
        inputSchema: memoryUpdateSchema,
        run: (toolCtx, input) => runMemoryUpdate(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "memory_delete",
        description: "Delete a memory by ID. This is permanent.",
        inputSchema: memoryDeleteSchema,
        run: (toolCtx, input) => runMemoryDelete(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "memory_related",
        description:
          "List memories linked to a given memory via RELATES_TO edges.",
        inputSchema: memoryRelatedSchema,
        run: (toolCtx, input) => runMemoryRelated(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "skills_list",
        description: "List enabled skills (name + description only).",
        inputSchema: skillsListSchema,
        run: (toolCtx) => runSkillsList(toolCtx),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "skills_get",
        description: "Fetch a single enabled skill by exact name.",
        inputSchema: skillsGetSchema,
        run: (toolCtx, input) => runSkillsGet(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "skills_create",
        description: "Create a new enabled skill for a repeatable workflow.",
        inputSchema: skillsCreateSchema,
        run: (toolCtx, input) => runSkillsCreate(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "skills_update",
        description: "Update an existing skill by exact name.",
        inputSchema: skillsUpdateSchema,
        run: (toolCtx, input) => runSkillsUpdate(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "skills_delete",
        description: "Permanently delete a skill by exact name.",
        inputSchema: skillsDeleteSchema,
        run: (toolCtx, input) => runSkillsDelete(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "wiki_list",
        description: "List all wiki folders and documents.",
        inputSchema: wikiListSchema,
        run: (toolCtx) => runWikiList(toolCtx),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "wiki_get",
        description: "Fetch a single wiki node by id.",
        inputSchema: wikiGetSchema,
        run: (toolCtx, input) => runWikiGet(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "wiki_search",
        description: "Full-text search wiki titles and document bodies.",
        inputSchema: wikiSearchSchema,
        run: (toolCtx, input) => runWikiSearch(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "wiki_create",
        description: "Create a wiki folder or document.",
        inputSchema: wikiCreateSchema,
        run: (toolCtx, input) => runWikiCreate(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "wiki_update",
        description: "Update a wiki node by id.",
        inputSchema: wikiUpdateSchema,
        run: (toolCtx, input) => runWikiUpdate(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "wiki_delete",
        description: "Permanently delete a wiki folder or document by id.",
        inputSchema: wikiDeleteSchema,
        run: (toolCtx, input) => runWikiDelete(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "codebases_list",
        description: "List GitHub repositories connected to vmem.",
        inputSchema: codebasesListSchema,
        run: (toolCtx) => runCodebasesList(toolCtx),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "codebase_overview",
        description: "Get aggregate stats for a synced codebase.",
        inputSchema: codebaseOverviewSchema,
        run: (toolCtx, input) => runCodebaseOverview(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "codebase_search",
        description: "Search symbols inside a synced codebase.",
        inputSchema: codebaseSearchSchema,
        run: (toolCtx, input) => runCodebaseSearch(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "codebase_context",
        description: "Get a symbol's metadata plus CALLS relationships.",
        inputSchema: codebaseContextSchema,
        run: (toolCtx, input) => runCodebaseContext(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "codebase_impact",
        description:
          "Traverse CALLS edges upstream or downstream from a symbol.",
        inputSchema: codebaseImpactSchema,
        run: (toolCtx, input) => runCodebaseImpact(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
    definePersonalTool(
      {
        name: "codebase_graph",
        description: "Fetch a filtered subgraph of a synced codebase.",
        inputSchema: codebaseGraphSchema,
        run: (toolCtx, input) => runCodebaseGraph(toolCtx, input),
      },
      handlerCtx,
      collector,
    ),
  ];

  return Object.fromEntries(entries);
}
