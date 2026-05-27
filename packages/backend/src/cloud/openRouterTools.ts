// @ts-nocheck
import { type Tool, type ToolSet, zodSchema } from "ai";
import type { ActionCtx } from "../../convex/_generated/server";
import type { CloudMemoryRef } from "./cloudMemoryRef";
import {
  runCodebaseContext,
  runCodebaseGraph,
  runCodebaseImpact,
  runCodebaseOverview,
  runCodebaseSearch,
  runCodebasesList,
  runListProfiles,
  runMemoryRelated,
  runMemoryRetrieve,
  runMemorySearch,
  runPing,
  runSkillsGet,
  runSkillsList,
  runWhoami,
  runWikiGet,
  runWikiList,
  runWikiSearch,
  type ToolHandlerContext,
  type ToolHandlerResult,
} from "../../convex/mcp/toolHandlers";
import {
  codebaseContextSchema,
  codebaseGraphSchema,
  codebaseImpactSchema,
  codebaseOverviewSchema,
  codebaseSearchSchema,
  codebasesListSchema,
  listProfilesSchema,
  memoryRelatedSchema,
  memoryRetrieveSchema,
  memorySearchSchema,
  pingSchema,
  skillsGetSchema,
  skillsListSchema,
  whoamiSchema,
  wikiGetSchema,
  wikiListSchema,
  wikiSearchSchema,
} from "../../convex/mcp/schemas";

export type { CloudMemoryRef };

type OpenRouterToolConfig = {
  description: string;
  inputSchema: Tool["inputSchema"];
  execute: NonNullable<Tool["execute"]>;
};

interface OpenRouterToolOptions {
  onMemoryRetrieve?: (refs: CloudMemoryRef[]) => void;
}

function openRouterTool(config: OpenRouterToolConfig): Tool {
  return config;
}

async function runHandler(
  run: () => Promise<ToolHandlerResult>,
): Promise<ToolHandlerResult> {
  return await run();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function readTrace(record: Record<string, unknown>): CloudMemoryRef["trace"] {
  const trace = record.trace;
  if (!isRecord(trace)) return undefined;

  const score = readNumber(trace, "score");
  const reason = readString(trace, "reason");
  const breakdown = trace.scoreBreakdown;
  if (score === null || reason === null || !isRecord(breakdown)) {
    return undefined;
  }

  const fulltext = readNumber(breakdown, "fulltext");
  const vector = readNumber(breakdown, "vector");
  const recency = readNumber(breakdown, "recency");
  const confidence = readNumber(breakdown, "confidence");
  if (
    fulltext === null ||
    vector === null ||
    recency === null ||
    confidence === null
  ) {
    return undefined;
  }

  return {
    score,
    reason,
    scoreBreakdown: { fulltext, vector, recency, confidence },
  };
}

function toCloudMemoryRefs(data: unknown): CloudMemoryRef[] {
  if (!Array.isArray(data)) return [];

  const refs: CloudMemoryRef[] = [];
  for (const row of data) {
    if (!isRecord(row)) continue;
    const id = readString(row, "id");
    const title = readString(row, "title");
    if (!id || !title) continue;
    refs.push({ id, title, trace: readTrace(row) });
  }
  return refs;
}

export function buildOpenRouterTools(
  ctx: ActionCtx,
  clerkUserId: string,
  options: OpenRouterToolOptions = {},
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
    execute: async () => runHandler(() => runPing(handlerCtx)),
  });

  tools.whoami = openRouterTool({
    description:
      "Returns the authenticated user, active personal profile, and profiles visible on this personal MCP connector.",
    inputSchema: zodSchema(whoamiSchema),
    execute: async () => runHandler(() => runWhoami(handlerCtx)),
  });

  tools.list_profiles = openRouterTool({
    description:
      "List personal profiles available on this MCP connector. Returns profile IDs, names, colors, and icons.",
    inputSchema: zodSchema(listProfilesSchema),
    execute: async () => runHandler(() => runListProfiles(handlerCtx)),
  });

  tools.memory_search = openRouterTool({
    description: "Search your memories by query text, type, tags, or source.",
    inputSchema: zodSchema(memorySearchSchema),
    execute: async (input) =>
      runHandler(() => runMemorySearch(handlerCtx, input)),
  });

  tools.memory_retrieve = openRouterTool({
    description:
      "Retrieve the most relevant memories for a natural language query with score breakdown.",
    inputSchema: zodSchema(memoryRetrieveSchema),
    execute: async (input) => {
      const result = await runHandler(() =>
        runMemoryRetrieve(handlerCtx, input),
      );
      if (result.ok) {
        options.onMemoryRetrieve?.(toCloudMemoryRefs(result.data));
      }
      return result;
    },
  });

  tools.memory_related = openRouterTool({
    description: "List memories linked to a given memory via RELATES_TO edges.",
    inputSchema: zodSchema(memoryRelatedSchema),
    execute: async (input) =>
      runHandler(() => runMemoryRelated(handlerCtx, input)),
  });

  tools.skills_list = openRouterTool({
    description: "List enabled skills (name + description only).",
    inputSchema: zodSchema(skillsListSchema),
    execute: async () => runHandler(() => runSkillsList(handlerCtx)),
  });

  tools.skills_get = openRouterTool({
    description: "Fetch a single enabled skill by exact name.",
    inputSchema: zodSchema(skillsGetSchema),
    execute: async (input) => runHandler(() => runSkillsGet(handlerCtx, input)),
  });

  tools.wiki_list = openRouterTool({
    description: "List all wiki folders and documents.",
    inputSchema: zodSchema(wikiListSchema),
    execute: async () => runHandler(() => runWikiList(handlerCtx)),
  });

  tools.wiki_get = openRouterTool({
    description: "Fetch a single wiki node by id.",
    inputSchema: zodSchema(wikiGetSchema),
    execute: async (input) => runHandler(() => runWikiGet(handlerCtx, input)),
  });

  tools.wiki_search = openRouterTool({
    description: "Full-text search wiki titles and document bodies.",
    inputSchema: zodSchema(wikiSearchSchema),
    execute: async (input) =>
      runHandler(() => runWikiSearch(handlerCtx, input)),
  });

  tools.codebases_list = openRouterTool({
    description: "List GitHub repositories connected to vmem.",
    inputSchema: zodSchema(codebasesListSchema),
    execute: async () => runHandler(() => runCodebasesList(handlerCtx)),
  });

  tools.codebase_overview = openRouterTool({
    description: "Get aggregate stats for a synced codebase.",
    inputSchema: zodSchema(codebaseOverviewSchema),
    execute: async (input) =>
      runHandler(() => runCodebaseOverview(handlerCtx, input)),
  });

  tools.codebase_search = openRouterTool({
    description: "Search symbols inside a synced codebase.",
    inputSchema: zodSchema(codebaseSearchSchema),
    execute: async (input) =>
      runHandler(() => runCodebaseSearch(handlerCtx, input)),
  });

  tools.codebase_context = openRouterTool({
    description: "Get a symbol's metadata plus CALLS relationships.",
    inputSchema: zodSchema(codebaseContextSchema),
    execute: async (input) =>
      runHandler(() => runCodebaseContext(handlerCtx, input)),
  });

  tools.codebase_impact = openRouterTool({
    description: "Traverse CALLS edges upstream or downstream from a symbol.",
    inputSchema: zodSchema(codebaseImpactSchema),
    execute: async (input) =>
      runHandler(() => runCodebaseImpact(handlerCtx, input)),
  });

  tools.codebase_graph = openRouterTool({
    description: "Fetch a filtered subgraph of a synced codebase.",
    inputSchema: zodSchema(codebaseGraphSchema),
    execute: async (input) =>
      runHandler(() => runCodebaseGraph(handlerCtx, input)),
  });

  return tools;
}
