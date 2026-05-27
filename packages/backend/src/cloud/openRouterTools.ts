import { type Tool, type ToolSet, zodSchema } from "ai";
import type { ActionCtx } from "../../convex/_generated/server";
import {
  formatToolResult,
  type ToolHandlerResult,
} from "../../convex/mcp/toolResults";
import {
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
} from "../../convex/mcp/toolHandlers";
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
import { MemoryRefCollector } from "./memoryRefCollector";

type OpenRouterToolConfig = {
  description: string;
  inputSchema: Tool["inputSchema"];
  execute: NonNullable<Tool["execute"]>;
};

function openRouterTool(config: OpenRouterToolConfig): Tool {
  return config;
}

async function runHandler<T>(
  collector: MemoryRefCollector,
  run: () => Promise<ToolHandlerResult<T>>,
  onSuccess?: (collector: MemoryRefCollector, data: T) => void,
): Promise<string> {
  const result = await run();
  if (result.ok && onSuccess) {
    onSuccess(collector, result.data);
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

  const tools: Record<string, Tool> = {};

  tools.ping = openRouterTool({
    description: "Health check tool for connector validation.",
    inputSchema: zodSchema(pingSchema),
    execute: async () => runHandler(collector, () => runPing(handlerCtx)),
  });

  tools.whoami = openRouterTool({
    description:
      "Returns the authenticated user, active personal profile, and profiles visible on this personal MCP connector.",
    inputSchema: zodSchema(whoamiSchema),
    execute: async () => runHandler(collector, () => runWhoami(handlerCtx)),
  });

  tools.list_profiles = openRouterTool({
    description:
      "List personal profiles available on this MCP connector. Returns profile IDs, names, colors, and icons.",
    inputSchema: zodSchema(listProfilesSchema),
    execute: async () =>
      runHandler(collector, () => runListProfiles(handlerCtx)),
  });

  tools.set_active_profile = openRouterTool({
    description:
      "Set the default personal profile for MCP memory tools when profileId is omitted.",
    inputSchema: zodSchema(setActiveProfileSchema),
    execute: async (input) =>
      runHandler(collector, () => runSetActiveProfile(handlerCtx, input)),
  });

  tools.memory_search = openRouterTool({
    description: "Search your memories by query text, type, tags, or source.",
    inputSchema: zodSchema(memorySearchSchema),
    execute: async (input) =>
      runHandler(
        collector,
        () => runMemorySearch(handlerCtx, input),
        (c, data) => c.collectMemorySearch(data),
      ),
  });

  tools.memory_retrieve = openRouterTool({
    description:
      "Retrieve the most relevant memories for a natural language query with score breakdown.",
    inputSchema: zodSchema(memoryRetrieveSchema),
    execute: async (input) =>
      runHandler(
        collector,
        () => runMemoryRetrieve(handlerCtx, input),
        (c, data) => c.collectMemoryRetrieve(data),
      ),
  });

  tools.memory_add = openRouterTool({
    description: "Store a new memory (profile, episodic, or knowledge type).",
    inputSchema: zodSchema(memoryAddSchema),
    execute: async (input) =>
      runHandler(
        collector,
        () => runMemoryAdd(handlerCtx, input),
        (c, data) => c.collectMemoryAdd(data),
      ),
  });

  tools.memory_add_instruction = openRouterTool({
    description:
      "Store memories from a natural-language instruction (requires OpenRouter).",
    inputSchema: zodSchema(memoryAddInstructionSchema),
    execute: async (input) =>
      runHandler(
        collector,
        () => runMemoryAddInstruction(handlerCtx, input),
        (c, data) => c.collectMemoryAddInstruction(data),
      ),
  });

  tools.memory_update = openRouterTool({
    description: "Update an existing memory by ID.",
    inputSchema: zodSchema(memoryUpdateSchema),
    execute: async (input) =>
      runHandler(collector, () => runMemoryUpdate(handlerCtx, input)),
  });

  tools.memory_delete = openRouterTool({
    description: "Delete a memory by ID. This is permanent.",
    inputSchema: zodSchema(memoryDeleteSchema),
    execute: async (input) =>
      runHandler(collector, () => runMemoryDelete(handlerCtx, input)),
  });

  tools.memory_related = openRouterTool({
    description: "List memories linked to a given memory via RELATES_TO edges.",
    inputSchema: zodSchema(memoryRelatedSchema),
    execute: async (input) =>
      runHandler(collector, () => runMemoryRelated(handlerCtx, input)),
  });

  tools.skills_list = openRouterTool({
    description: "List enabled skills (name + description only).",
    inputSchema: zodSchema(skillsListSchema),
    execute: async () => runHandler(collector, () => runSkillsList(handlerCtx)),
  });

  tools.skills_get = openRouterTool({
    description: "Fetch a single enabled skill by exact name.",
    inputSchema: zodSchema(skillsGetSchema),
    execute: async (input) =>
      runHandler(collector, () => runSkillsGet(handlerCtx, input)),
  });

  tools.skills_create = openRouterTool({
    description: "Create a new enabled skill for a repeatable workflow.",
    inputSchema: zodSchema(skillsCreateSchema),
    execute: async (input) =>
      runHandler(collector, () => runSkillsCreate(handlerCtx, input)),
  });

  tools.skills_update = openRouterTool({
    description: "Update an existing skill by exact name.",
    inputSchema: zodSchema(skillsUpdateSchema),
    execute: async (input) =>
      runHandler(collector, () => runSkillsUpdate(handlerCtx, input)),
  });

  tools.skills_delete = openRouterTool({
    description: "Permanently delete a skill by exact name.",
    inputSchema: zodSchema(skillsDeleteSchema),
    execute: async (input) =>
      runHandler(collector, () => runSkillsDelete(handlerCtx, input)),
  });

  tools.wiki_list = openRouterTool({
    description: "List all wiki folders and documents.",
    inputSchema: zodSchema(wikiListSchema),
    execute: async () => runHandler(collector, () => runWikiList(handlerCtx)),
  });

  tools.wiki_get = openRouterTool({
    description: "Fetch a single wiki node by id.",
    inputSchema: zodSchema(wikiGetSchema),
    execute: async (input) =>
      runHandler(collector, () => runWikiGet(handlerCtx, input)),
  });

  tools.wiki_search = openRouterTool({
    description: "Full-text search wiki titles and document bodies.",
    inputSchema: zodSchema(wikiSearchSchema),
    execute: async (input) =>
      runHandler(collector, () => runWikiSearch(handlerCtx, input)),
  });

  tools.wiki_create = openRouterTool({
    description: "Create a wiki folder or document.",
    inputSchema: zodSchema(wikiCreateSchema),
    execute: async (input) =>
      runHandler(collector, () => runWikiCreate(handlerCtx, input)),
  });

  tools.wiki_update = openRouterTool({
    description: "Update a wiki node by id.",
    inputSchema: zodSchema(wikiUpdateSchema),
    execute: async (input) =>
      runHandler(collector, () => runWikiUpdate(handlerCtx, input)),
  });

  tools.wiki_delete = openRouterTool({
    description: "Permanently delete a wiki folder or document by id.",
    inputSchema: zodSchema(wikiDeleteSchema),
    execute: async (input) =>
      runHandler(collector, () => runWikiDelete(handlerCtx, input)),
  });

  tools.codebases_list = openRouterTool({
    description: "List GitHub repositories connected to vmem.",
    inputSchema: zodSchema(codebasesListSchema),
    execute: async () =>
      runHandler(collector, () => runCodebasesList(handlerCtx)),
  });

  tools.codebase_overview = openRouterTool({
    description: "Get aggregate stats for a synced codebase.",
    inputSchema: zodSchema(codebaseOverviewSchema),
    execute: async (input) =>
      runHandler(collector, () => runCodebaseOverview(handlerCtx, input)),
  });

  tools.codebase_search = openRouterTool({
    description: "Search symbols inside a synced codebase.",
    inputSchema: zodSchema(codebaseSearchSchema),
    execute: async (input) =>
      runHandler(collector, () => runCodebaseSearch(handlerCtx, input)),
  });

  tools.codebase_context = openRouterTool({
    description: "Get a symbol's metadata plus CALLS relationships.",
    inputSchema: zodSchema(codebaseContextSchema),
    execute: async (input) =>
      runHandler(collector, () => runCodebaseContext(handlerCtx, input)),
  });

  tools.codebase_impact = openRouterTool({
    description: "Traverse CALLS edges upstream or downstream from a symbol.",
    inputSchema: zodSchema(codebaseImpactSchema),
    execute: async (input) =>
      runHandler(collector, () => runCodebaseImpact(handlerCtx, input)),
  });

  tools.codebase_graph = openRouterTool({
    description: "Fetch a filtered subgraph of a synced codebase.",
    inputSchema: zodSchema(codebaseGraphSchema),
    execute: async (input) =>
      runHandler(collector, () => runCodebaseGraph(handlerCtx, input)),
  });

  return tools;
}
