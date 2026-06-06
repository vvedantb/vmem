import { type Tool, type ToolSet, tool, zodSchema } from "ai";
import type { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import type { CloudMemoryRef } from "./cloudMemoryRef";
import { toolSpecs, type ToolSpec } from "../mcp/toolCatalog";
import type { ToolHandlerContext } from "../mcp/toolHandlers";

export type { CloudMemoryRef };

interface OpenRouterToolOptions {
  onMemoryRetrieve?: (refs: CloudMemoryRef[]) => void;
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

type ZodShape = z.ZodRawShape;

/**
 * Wrap a catalog spec as an AI SDK tool with a fixed `Tool` return type so
 * `buildOpenRouterTools` does not instantiate a dozen nested `tool()` generics.
 */
function defineReadOnlyCloudTool<Shape extends ZodShape>(
  description: string,
  spec: ToolSpec<Shape>,
  h: ToolHandlerContext,
): Tool {
  type Params = z.infer<z.ZodObject<Shape>>;
  const execute = (input: Params | undefined) => {
    const params: Params = spec.schema.parse(input ?? {});
    return spec.run(h, params);
  };
  // tsgo hits TS2589 when zodSchema + tool() nest per catalog shape; runtime
  // validation still flows through toolSpecs.
  const cloudTool: Tool = tool({
    description,
    // @ts-expect-error TS2589 — catalog schema drives runtime validation
    inputSchema: zodSchema(spec.schema),
    execute,
  });
  return cloudTool;
}

/**
 * Build the read-only subset of vmem tools exposed to cloud chat's free
 * OpenRouter models. Tool name, input schema, and handler all come from the
 * shared catalog (`toolCatalog.ts`); only the cloud-specific (terse)
 * description lives here. Write tools (memory_add/update/delete, skills and
 * wiki mutations, set_active_profile) are intentionally omitted from this
 * surface.
 */
export function buildOpenRouterTools(
  ctx: ActionCtx,
  clerkUserId: string,
  options: OpenRouterToolOptions = {},
): ToolSet {
  const h: ToolHandlerContext = { ctx, clerkUserId, scope: "personal" };

  const memoryRetrieve: Tool = tool({
    description:
      "Retrieve the most relevant memories for a natural language query with score breakdown.",
    // @ts-expect-error TS2589 — zodSchema + tool() deep-instantiates on memory_retrieve shape
    inputSchema: zodSchema(toolSpecs.memory_retrieve.schema),
    execute: (input) => {
      const params = toolSpecs.memory_retrieve.schema.parse(input ?? {});
      return toolSpecs.memory_retrieve.run(h, params).then((result) => {
        if (result.ok) {
          options.onMemoryRetrieve?.(toCloudMemoryRefs(result.data));
        }
        return result;
      });
    },
  });

  const tools: ToolSet = {
    ping: defineReadOnlyCloudTool(
      "Health check tool for connector validation.",
      toolSpecs.ping,
      h,
    ),
    whoami: defineReadOnlyCloudTool(
      "Returns the authenticated user, active personal profile, and profiles visible on this personal MCP connector.",
      toolSpecs.whoami,
      h,
    ),
    list_profiles: defineReadOnlyCloudTool(
      "List personal profiles available on this MCP connector. Returns profile IDs, names, colors, and icons.",
      toolSpecs.list_profiles,
      h,
    ),
    memory_search: defineReadOnlyCloudTool(
      "Search your memories by query text, type, tags, or source.",
      toolSpecs.memory_search,
      h,
    ),
    memory_retrieve: memoryRetrieve,
    memory_related: defineReadOnlyCloudTool(
      "List memories linked to a given memory via RELATES_TO edges.",
      toolSpecs.memory_related,
      h,
    ),
    skills_list: defineReadOnlyCloudTool(
      "List enabled skills (name + description only).",
      toolSpecs.skills_list,
      h,
    ),
    skills_get: defineReadOnlyCloudTool(
      "Fetch a single enabled skill by exact name.",
      toolSpecs.skills_get,
      h,
    ),
    wiki_list: defineReadOnlyCloudTool(
      "List all wiki folders and documents.",
      toolSpecs.wiki_list,
      h,
    ),
    wiki_get: defineReadOnlyCloudTool(
      "Fetch a single wiki node by id.",
      toolSpecs.wiki_get,
      h,
    ),
    wiki_search: defineReadOnlyCloudTool(
      "Full-text search wiki titles and document bodies.",
      toolSpecs.wiki_search,
      h,
    ),
    codebases_list: defineReadOnlyCloudTool(
      "List GitHub repositories connected to vmem.",
      toolSpecs.codebases_list,
      h,
    ),
    codebase_overview: defineReadOnlyCloudTool(
      "Get aggregate stats for a synced codebase.",
      toolSpecs.codebase_overview,
      h,
    ),
    codebase_search: defineReadOnlyCloudTool(
      "Search symbols inside a synced codebase.",
      toolSpecs.codebase_search,
      h,
    ),
    codebase_context: defineReadOnlyCloudTool(
      "Get a symbol's metadata plus CALLS relationships.",
      toolSpecs.codebase_context,
      h,
    ),
    codebase_impact: defineReadOnlyCloudTool(
      "Traverse CALLS edges upstream or downstream from a symbol.",
      toolSpecs.codebase_impact,
      h,
    ),
    codebase_graph: defineReadOnlyCloudTool(
      "Fetch a filtered subgraph of a synced codebase.",
      toolSpecs.codebase_graph,
      h,
    ),
  };

  return tools;
}
