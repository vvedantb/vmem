import { type ToolSet, tool, zodSchema } from "ai";
import type { ActionCtx } from "../../convex/_generated/server";
import type { CloudMemoryRef } from "./cloudMemoryRef";
import { toolSpecs } from "../../convex/mcp/toolCatalog";
import type { ToolHandlerContext } from "../../convex/mcp/toolHandlers";

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

/**
 * Build the read-only subset of vmem tools exposed to cloud chat's free
 * OpenRouter models. Tool name, input schema, and handler all come from the
 * shared catalog (`toolCatalog.ts`); only the cloud-specific (terse)
 * description lives here. Write tools (memory_add/update/delete, skills and
 * wiki mutations, set_active_profile) are intentionally omitted from this
 * surface. Each `tool()` keeps its concrete schema type so input stays typed
 * end-to-end — no `@ts-nocheck`.
 */
export function buildOpenRouterTools(
  ctx: ActionCtx,
  clerkUserId: string,
  options: OpenRouterToolOptions = {},
): ToolSet {
  const h: ToolHandlerContext = { ctx, clerkUserId, scope: "personal" };

  return {
    ping: tool({
      description: "Health check tool for connector validation.",
      inputSchema: zodSchema(toolSpecs.ping.schema),
      execute: (input) => toolSpecs.ping.run(h, input),
    }),
    whoami: tool({
      description:
        "Returns the authenticated user, active personal profile, and profiles visible on this personal MCP connector.",
      inputSchema: zodSchema(toolSpecs.whoami.schema),
      execute: (input) => toolSpecs.whoami.run(h, input),
    }),
    list_profiles: tool({
      description:
        "List personal profiles available on this MCP connector. Returns profile IDs, names, colors, and icons.",
      inputSchema: zodSchema(toolSpecs.list_profiles.schema),
      execute: (input) => toolSpecs.list_profiles.run(h, input),
    }),
    memory_search: tool({
      description: "Search your memories by query text, type, tags, or source.",
      inputSchema: zodSchema(toolSpecs.memory_search.schema),
      execute: (input) => toolSpecs.memory_search.run(h, input),
    }),
    memory_retrieve: tool({
      description:
        "Retrieve the most relevant memories for a natural language query with score breakdown.",
      inputSchema: zodSchema(toolSpecs.memory_retrieve.schema),
      execute: async (input) => {
        const result = await toolSpecs.memory_retrieve.run(h, input);
        if (result.ok) {
          options.onMemoryRetrieve?.(toCloudMemoryRefs(result.data));
        }
        return result;
      },
    }),
    memory_related: tool({
      description:
        "List memories linked to a given memory via RELATES_TO edges.",
      inputSchema: zodSchema(toolSpecs.memory_related.schema),
      execute: (input) => toolSpecs.memory_related.run(h, input),
    }),
    skills_list: tool({
      description: "List enabled skills (name + description only).",
      inputSchema: zodSchema(toolSpecs.skills_list.schema),
      execute: (input) => toolSpecs.skills_list.run(h, input),
    }),
    skills_get: tool({
      description: "Fetch a single enabled skill by exact name.",
      inputSchema: zodSchema(toolSpecs.skills_get.schema),
      execute: (input) => toolSpecs.skills_get.run(h, input),
    }),
    wiki_list: tool({
      description: "List all wiki folders and documents.",
      inputSchema: zodSchema(toolSpecs.wiki_list.schema),
      execute: (input) => toolSpecs.wiki_list.run(h, input),
    }),
    wiki_get: tool({
      description: "Fetch a single wiki node by id.",
      inputSchema: zodSchema(toolSpecs.wiki_get.schema),
      execute: (input) => toolSpecs.wiki_get.run(h, input),
    }),
    wiki_search: tool({
      description: "Full-text search wiki titles and document bodies.",
      inputSchema: zodSchema(toolSpecs.wiki_search.schema),
      execute: (input) => toolSpecs.wiki_search.run(h, input),
    }),
    codebases_list: tool({
      description: "List GitHub repositories connected to vmem.",
      inputSchema: zodSchema(toolSpecs.codebases_list.schema),
      execute: (input) => toolSpecs.codebases_list.run(h, input),
    }),
    codebase_overview: tool({
      description: "Get aggregate stats for a synced codebase.",
      inputSchema: zodSchema(toolSpecs.codebase_overview.schema),
      execute: (input) => toolSpecs.codebase_overview.run(h, input),
    }),
    codebase_search: tool({
      description: "Search symbols inside a synced codebase.",
      inputSchema: zodSchema(toolSpecs.codebase_search.schema),
      execute: (input) => toolSpecs.codebase_search.run(h, input),
    }),
    codebase_context: tool({
      description: "Get a symbol's metadata plus CALLS relationships.",
      inputSchema: zodSchema(toolSpecs.codebase_context.schema),
      execute: (input) => toolSpecs.codebase_context.run(h, input),
    }),
    codebase_impact: tool({
      description: "Traverse CALLS edges upstream or downstream from a symbol.",
      inputSchema: zodSchema(toolSpecs.codebase_impact.schema),
      execute: (input) => toolSpecs.codebase_impact.run(h, input),
    }),
    codebase_graph: tool({
      description: "Fetch a filtered subgraph of a synced codebase.",
      inputSchema: zodSchema(toolSpecs.codebase_graph.schema),
      execute: (input) => toolSpecs.codebase_graph.run(h, input),
    }),
  };
}
