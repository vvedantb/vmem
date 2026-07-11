import {
  type Tool,
  type ToolSet,
  type JSONSchema7,
  tool,
  jsonSchema,
} from "ai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ActionCtx } from "../_generated/server";
import type { CloudMemoryRef } from "./cloudMemoryRef";
import type { McpScope } from "../profiles/mcpAccess";
import { toolSpecs, type ToolSpec } from "../mcp/toolCatalog";
import type { ToolHandlerContext } from "../mcp/toolHandlers";

export type { CloudMemoryRef };

interface OpenRouterToolOptions {
  onMemoryRetrieve?: (refs: CloudMemoryRef[]) => void;
  /** Pin memory tools to the chat thread's workspace profile. */
  profileId?: string;
  /** "team" when the pinned profile belongs to a team. */
  scope?: McpScope;
}

/**
 * `memory_retrieve` results arrive as the handler's untyped action payload, so
 * they are validated here at that boundary. Rows that don't match are skipped
 * and a malformed `trace` degrades to `undefined` — a bad row must never break
 * the chat stream's memory citations.
 */
const cloudMemoryRefsSchema = z
  .array(
    z
      .object({
        id: z.string().min(1),
        title: z.string().min(1),
        trace: z
          .object({
            score: z.number(),
            reason: z.string(),
            scoreBreakdown: z.object({
              fulltext: z.number(),
              vector: z.number(),
              recency: z.number(),
              confidence: z.number(),
            }),
          })
          .optional()
          .catch(undefined),
      })
      .nullable()
      .catch(null),
  )
  .catch([]);

type ZodShape = z.ZodRawShape;

/**
 * Convert a catalog zod schema to the JSON schema sent to the provider.
 *
 * This deliberately avoids the AI SDK's `zodSchema()`: type-checking that call
 * against each catalog schema cost ~15-19s of `tsgo` check time for this file
 * alone (the old `@ts-expect-error TS2589` comments suppressed the error but
 * the checker still did the work). `zodToJsonSchema` takes `z.ZodTypeAny`, so
 * the checker stays shallow. Runtime validation is unaffected — every tool's
 * `execute` re-parses its input with `spec.schema.parse`.
 */
function toToolJsonSchema(schema: z.ZodTypeAny): JSONSchema7 {
  return zodToJsonSchema(schema, { $refStrategy: "none" });
}

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
  const cloudTool: Tool = tool({
    description,
    inputSchema: jsonSchema<Params>(toToolJsonSchema(spec.schema)),
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
  const h: ToolHandlerContext = {
    ctx,
    clerkUserId,
    scope: options.scope ?? "personal",
    fixedProfileId: options.profileId,
  };

  type RetrieveParams = z.infer<typeof toolSpecs.memory_retrieve.schema>;
  const memoryRetrieve: Tool = tool({
    description:
      "Retrieve the most relevant memories for a natural language query with score breakdown.",
    inputSchema: jsonSchema<RetrieveParams>(
      toToolJsonSchema(toolSpecs.memory_retrieve.schema),
    ),
    execute: (input: RetrieveParams | undefined) => {
      const params = toolSpecs.memory_retrieve.schema.parse(input ?? {});
      return toolSpecs.memory_retrieve.run(h, params).then((result) => {
        if (result.ok) {
          const refs = cloudMemoryRefsSchema
            .parse(result.data)
            .filter((ref) => ref !== null);
          options.onMemoryRetrieve?.(refs);
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
    context_prompt_get: defineReadOnlyCloudTool(
      "Returns the full vmem user profile markdown (profile, memories summary, Available Skills index).",
      toolSpecs.context_prompt_get,
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
