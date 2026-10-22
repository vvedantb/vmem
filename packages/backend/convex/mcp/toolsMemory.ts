import { z } from "zod";
import {
  deleteBodySchema,
  instructionStoreBodySchema,
  memoryStatusSchema,
  memoryTypeSchema,
  retrieveBodySchema,
  structuredStoreBodySchema,
  structuredUpdateBodySchema,
} from "@vmem/sdk";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { MemoryListResult, MemoryWithTags } from "../memoryApi/types";
import { enqueueMemoryAccess } from "../memoryUsefulness";
import { scopedMemory, toolSpec } from "./toolTypes";
import {
  loadMemoryForMcpScope,
  runForMcpScope,
  updateMemoryInMcpScope,
  withMcpMemoryScope,
  type McpResolvedScope,
} from "./memoryScope";
import {
  createMemoryForClerk,
  deleteMemoryForClerk,
  listMemoriesForClerk,
  listMemoriesForTeamProfile,
  relatedMemoriesForClerk,
  relatedMemoriesForTeamProfile,
  retrieveMemoriesForClerk,
  retrieveMemoriesForTeamProfile,
  storeMemoryFromInstruction,
  toMemoryStatus,
  toMemoryType,
} from "../memoryRuntime";

const isoDateSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "Expected an ISO 8601 date or date-time",
  });

function isoToMs(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Date.parse(value);
}

const MS_PER_DAY = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMELINE_DEFAULT_DAYS = 7;

// a bare date as an exclusive bound means the end of that utc day
function isoToEndMs(value: string): number {
  const ms = Date.parse(value);
  return DATE_ONLY.test(value) ? ms + MS_PER_DAY : ms;
}

// the slim rollup row agents see; tokens, cost and model stay server-side
export function toPeriodSummary(row: Doc<"rollups">) {
  return {
    period: row.period,
    periodKey: row.periodKey,
    start: new Date(row.startMs).toISOString(),
    end: new Date(row.endMs).toISOString(),
    summary: row.summary,
    highlights: row.highlights,
    memoryIds: row.memoryIds,
    stats: row.stats,
  };
}

const memorySearchSchema = z.object({
  query: z.string().optional().describe("Text to search for"),
  type: memoryTypeSchema.optional().describe("Filter by memory type"),
  types: z
    .array(memoryTypeSchema)
    .optional()
    .describe("Filter by several memory types (any of)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Filter by tags (memories must carry every tag)"),
  source: z
    .string()
    .optional()
    .describe("Filter by source (e.g. notion, google_drive, claude, mcp)"),
  sources: z
    .array(z.string())
    .optional()
    .describe("Filter by several sources (any of)"),
  status: memoryStatusSchema
    .optional()
    .describe(
      "Filter by status. Default shows active and pinned; pass suppressed or expired to see hidden memories",
    ),
  createdAfter: isoDateSchema
    .optional()
    .describe("Only memories created at or after this ISO date/time"),
  createdBefore: isoDateSchema
    .optional()
    .describe("Only memories created at or before this ISO date/time"),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID to search in (defaults to active profile)"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Max results (default 20)"),
  offset: z
    .number()
    .min(0)
    .optional()
    .describe("Offset for pagination (default 0)"),
});

const memoryRetrieveSchema = retrieveBodySchema
  .omit({ summarize: true, judge: true })
  .extend({
    query: retrieveBodySchema.shape.query.describe(
      "Natural language query to find relevant memories",
    ),
    type: memoryTypeSchema.optional().describe("Filter by memory type"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    status: memoryStatusSchema
      .optional()
      .describe("Filter by status (default: active and pinned)"),
    source: z
      .string()
      .optional()
      .describe("Filter by source (e.g. notion, google_drive, claude, mcp)"),
    profileId: z
      .string()
      .optional()
      .describe("Profile ID to search in (defaults to active profile)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max results (default 10)"),
    threshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Drop hits whose blended score is below this threshold"),
    rerank: z
      .union([z.boolean(), z.literal("jev")])
      .optional()
      .describe(
        'true = local #179 top-20 extra (ignored when Jev runs). "jev" is accepted and ignored — Jev is on by default when AI_GATEWAY_API_KEY is set.',
      ),
    referenceDate: z
      .string()
      .optional()
      .describe("ISO date used for last-week / currently temporal scoring"),
  });

const memoryAddSchema = structuredStoreBodySchema
  .omit({
    expiresAt: true,
    url: true,
    externalId: true,
    sourceType: true,
  })
  .extend({
    title: structuredStoreBodySchema.shape.title.describe(
      "Short title for the memory",
    ),
    content:
      structuredStoreBodySchema.shape.content.describe("The memory content"),
    type: memoryTypeSchema.describe(
      "Memory type: profile, episodic, or knowledge",
    ),
    source: structuredStoreBodySchema.shape.source.describe(
      "Where this memory came from (e.g. 'claude', 'chatgpt', 'manual')",
    ),
    tags: z
      .array(z.string())
      .optional()
      .describe(
        "1-3 broad recurring THEME tags (lowercase-hyphenated, e.g. 'react', 'health'). Reuse tags you've seen on the user's existing memories; never mint hyper-specific one-offs — named people/products belong in the content, not tags.",
      ),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Confidence score 0-1 (default 1.0)"),
    profileId: z
      .string()
      .optional()
      .describe("Profile ID to add memory to (defaults to active profile)"),
  });

const MEMORY_ADD_BATCH_MAX = 50;

const memoryAddBatchSchema = z.object({
  items: z
    .array(memoryAddSchema.omit({ profileId: true }))
    .min(1)
    .max(MEMORY_ADD_BATCH_MAX)
    .describe(
      "Up to 50 memories, each shaped like memory_add (title, content, type, source?, tags?, confidence?)",
    ),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID to add every memory to (defaults to active profile)"),
});

const memoryGetSchema = z.object({
  id: z.string().describe("Memory ID from memory_search or memory_retrieve"),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID the memory lives in (defaults to active profile)"),
});

const memoryAddInstructionSchema = instructionStoreBodySchema.extend({
  instruction: instructionStoreBodySchema.shape.instruction.describe(
    "What to remember, e.g. 'User prefers dark mode and uses pnpm for vmem'",
  ),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID (defaults to active MCP profile)"),
});

const memoryUpdateSchema = structuredUpdateBodySchema
  .omit({ expiresAt: true })
  .extend({
    id: structuredUpdateBodySchema.shape.id.describe("Memory ID to update"),
    title: z.string().optional().describe("New title"),
    content: z.string().optional().describe("New content"),
    type: memoryTypeSchema.optional().describe("New type"),
    status: memoryStatusSchema
      .optional()
      .describe("New status: active, pinned, suppressed, expired"),
    tags: z
      .array(z.string())
      .optional()
      .describe(
        "New tags, replaces all. 1-3 broad recurring themes (lowercase-hyphenated); reuse the user's existing tags where possible.",
      ),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("New confidence score"),
  });

const memoryDeleteSchema = deleteBodySchema.extend({
  id: deleteBodySchema.shape.id.describe("Memory ID to delete"),
});

const memoryTimelineSchema = z.object({
  date: isoDateSchema
    .optional()
    .describe(
      "What was known at this ISO date/time (a bare date means the end of that UTC day). Do not combine with start / end",
    ),
  start: isoDateSchema
    .optional()
    .describe("Window start, ISO date/time (default: 7 days before end)"),
  end: isoDateSchema
    .optional()
    .describe(
      "Window end, ISO date/time; a bare date includes that UTC day (default: now)",
    ),
  period: z
    .enum(["day", "week", "month"])
    .optional()
    .describe(
      "Summary granularity for a window (default: the coarsest period that fits it: month, then week, then day)",
    ),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID to read (defaults to active profile)"),
});

const memoryRelatedSchema = z.object({
  memoryId: z
    .string()
    .describe("Memory ID from memory_search or memory_retrieve"),
});

type MemoryAddFields = Omit<z.infer<typeof memoryAddSchema>, "profileId">;

function addMemoryInScope(
  ctx: ActionCtx,
  scope: McpResolvedScope,
  fields: MemoryAddFields,
): Promise<MemoryWithTags> {
  return createMemoryForClerk(ctx, {
    clerkId: scope.clerkId,
    profileId: scope.profileId,
    title: fields.title,
    content: fields.content,
    type: toMemoryType(fields.type) ?? "knowledge",
    source: fields.source ?? "mcp",
    tags: fields.tags ?? [],
    confidence: fields.confidence ?? 1.0,
  });
}

export const memoryToolSpecs = {
  memory_search: toolSpec({
    name: "memory_search",
    schema: memorySearchSchema,
    description:
      "Search or list your memories (newest first) by query text, type(s), tags, source(s), status, and created date window (createdAfter / createdBefore, ISO). Returns matching memories with metadata. total is a lower bound, not an exact count (reads are bounded): totalIsLowerBound is always true and hasMore says whether more results exist after this page. Do not treat total as an exact count. Defaults to the active profile unless profileId is specified.",
    errorLabel: "Search failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        (scope) => {
          const limit = params.limit ?? 20;
          const offset = params.offset ?? 0;
          const withBound = (result: MemoryListResult) => ({
            ...result,
            totalIsLowerBound: true,
            hasMore: result.total > offset + result.memories.length,
          });
          const filter = {
            type: params.type,
            types: params.types,
            tags: params.tags,
            source: params.source,
            sources: params.sources,
            status: params.status,
            createdAfter: isoToMs(params.createdAfter),
            createdBefore: isoToMs(params.createdBefore),
            searchQuery: params.query,
            limit,
            offset,
          };
          return runForMcpScope(scope, {
            team: async (profileId) =>
              withBound(
                await listMemoriesForTeamProfile(h.ctx, {
                  profileId,
                  ...filter,
                }),
              ),
            personal: async ({ clerkId, profileId }) =>
              withBound(
                await listMemoriesForClerk(h.ctx, {
                  clerkId,
                  profileId,
                  ...filter,
                }),
              ),
          });
        },
      );
    },
  }),
  memory_retrieve: toolSpec({
    name: "memory_retrieve",
    schema: memoryRetrieveSchema,
    description:
      "Retrieve the most relevant memories for a query using hybrid full-text, synonym, recency, temporal, and optional vector ranking. type, tags, status, and source filters are applied before ranking. Optional threshold drops low hybrid scores. Jev reranks the top 20 when AI_GATEWAY_API_KEY is set (fail-open without the key; no noul hard-drop). Defaults to the active profile unless profileId is specified.",
    errorLabel: "Retrieve failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        (scope) => {
          const limit = params.limit ?? 10;
          return runForMcpScope(scope, {
            team: (profileId) =>
              retrieveMemoriesForTeamProfile(h.ctx, {
                clerkId: scope.clerkId,
                profileId,
                query: params.query,
                type: params.type,
                tags: params.tags,
                status: params.status,
                source: params.source,
                limit,
                threshold: params.threshold,
                rerank: params.rerank,
                referenceDate: params.referenceDate,
              }),
            personal: ({ clerkId, profileId }) =>
              retrieveMemoriesForClerk(h.ctx, {
                clerkId,
                profileId,
                query: params.query,
                type: params.type,
                tags: params.tags,
                status: params.status,
                source: params.source,
                limit,
                threshold: params.threshold,
                rerank: params.rerank,
                referenceDate: params.referenceDate,
              }),
          });
        },
      );
    },
  }),
  memory_add: toolSpec({
    name: "memory_add",
    schema: memoryAddSchema,
    description:
      "Store a new memory. Use type 'profile' for stable user facts, 'episodic' for past events/interactions, 'knowledge' for durable extracted knowledge. An exact repeat (same title and content) of a visible memory in the profile is not stored again: the existing memory comes back with deduped: true, its visit count bumped and tags merged. Adds to the active profile unless profileId is specified.",
    errorLabel: "Add memory failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        (scope) => addMemoryInScope(h.ctx, scope, params),
      );
    },
  }),
  memory_add_batch: toolSpec({
    name: "memory_add_batch",
    schema: memoryAddBatchSchema,
    description:
      "Store up to 50 memories in one call (bulk import, e.g. a ChatGPT or Claude export). Each item takes the same fields as memory_add. Items are stored one by one in order; returns created ids (deduped: true when an item repeated an existing memory) and per-item errors, so a failed item does not undo the others. Adds to the active profile unless profileId is specified.",
    errorLabel: "Add memory batch failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        async (scope) => {
          const created: Array<{
            index: number;
            id: string;
            title: string;
            deduped?: boolean;
          }> = [];
          const failed: Array<{ index: number; error: string }> = [];
          for (const [index, item] of params.items.entries()) {
            try {
              const memory = await addMemoryInScope(h.ctx, scope, item);
              created.push({
                index,
                id: memory.id,
                title: memory.title,
                ...(memory.deduped === true ? { deduped: true } : {}),
              });
            } catch (err) {
              failed.push({
                index,
                error: err instanceof Error ? err.message : "Unknown error",
              });
            }
          }
          return { profileId: scope.profileId, created, failed };
        },
      );
    },
  }),
  memory_get: toolSpec({
    name: "memory_get",
    schema: memoryGetSchema,
    description:
      "Fetch one memory by ID with full content, tags, type, status, provenance (source, sourceUrl, sourceSyncedAt) and timestamps. Counts as opening the memory (usefulness signal), like opening it in the web app. Returns 'Memory not found' for IDs outside the active (or given) profile.",
    errorLabel: "Get memory failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        async (scope) => {
          const memory = await loadMemoryForMcpScope(h.ctx, {
            ...scope,
            memoryId: params.id,
          });
          await enqueueMemoryAccess(h.ctx, [memory.id], "search");
          return memory;
        },
      );
    },
  }),
  memory_add_instruction: toolSpec({
    name: "memory_add_instruction",
    schema: memoryAddInstructionSchema,
    description:
      "Store a memory from a natural-language instruction. Requires AI_GATEWAY_API_KEY on the Convex deployment; fails with openrouter_required without it. Exact duplicates are skipped; near-duplicates supersede the prior row. Prefer memory_add when you already have a single clear fact with title and type.",
    errorLabel: "Add from instruction failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        (scope) =>
          storeMemoryFromInstruction(h.ctx, {
            clerkId: scope.clerkId,
            instruction: params.instruction,
            profileId: scope.profileId,
          }),
      );
    },
  }),
  memory_update: toolSpec({
    name: "memory_update",
    schema: memoryUpdateSchema,
    description:
      "Update an existing memory by ID. Only include fields you want to change.",
    errorLabel: "Update failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(h.ctx, scopedMemory(h), (scope) =>
        updateMemoryInMcpScope(h.ctx, scope, params.id, {
          title: params.title,
          content: params.content,
          type: toMemoryType(params.type),
          status: toMemoryStatus(params.status),
          tags: params.tags,
          confidence: params.confidence,
        }),
      );
    },
  }),
  memory_delete: toolSpec({
    name: "memory_delete",
    schema: memoryDeleteSchema,
    description: "Delete a memory by ID. This is permanent.",
    errorLabel: "Delete failed",
    async run(h, params): Promise<unknown> {
      const deleted = await withMcpMemoryScope(
        h.ctx,
        scopedMemory(h),
        async (scope) => {
          const memory = await loadMemoryForMcpScope(h.ctx, {
            clerkId: scope.clerkId,
            mcpScope: scope.mcpScope,
            profileId: scope.profileId,
            memoryId: params.id,
          });
          return deleteMemoryForClerk(h.ctx, memory.userId, params.id);
        },
      );
      return { deleted };
    },
  }),
  memory_timeline: toolSpec({
    name: "memory_timeline",
    schema: memoryTimelineSchema,
    description:
      "Time travel over stored activity summaries (rollups). Rollups are written nightly per UTC day, ISO week and month; this tool only reads them and never calls an LLM. Pass start / end (ISO) for the summaries that overlap a window (oldest first, at most 31; period picks day, week or month). Pass date for what was known at that time: the newest month, week and day summaries that ended by then, plus the newest 20 memories created before it (slim rows, today's text: memories have no version history). Each summary has summary, highlights, stats and the memoryIds it cites (open them with memory_get). Omit all for the last 7 days. An empty list means no rollup ran for that time.",
    errorLabel: "Memory timeline failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        async (scope) => {
          const reader = { clerkId: scope.clerkId, profileId: scope.profileId };
          if (params.date !== undefined) {
            if (params.start !== undefined || params.end !== undefined) {
              throw new Error("Pass date, or start / end, not both");
            }
            const atMs = isoToEndMs(params.date);
            const known = await h.ctx.runQuery(
              internal.rollups.knownAtInternal,
              { ...reader, atMs },
            );
            return {
              at: new Date(atMs).toISOString(),
              summaries: known.rollups.map(toPeriodSummary),
              memories: known.memories,
            };
          }
          const endMs =
            params.end === undefined ? Date.now() : isoToEndMs(params.end);
          const startMs =
            isoToMs(params.start) ?? endMs - TIMELINE_DEFAULT_DAYS * MS_PER_DAY;
          if (startMs >= endMs) throw new Error("start must be before end");
          const window = await h.ctx.runQuery(
            internal.rollups.getRollupsInternal,
            { ...reader, startMs, endMs, period: params.period },
          );
          return {
            start: new Date(startMs).toISOString(),
            end: new Date(endMs).toISOString(),
            period: window.period,
            summaries: window.rollups.map(toPeriodSummary),
          };
        },
      );
    },
  }),
  memory_related: toolSpec({
    name: "memory_related",
    schema: memoryRelatedSchema,
    description:
      "List memories related to a given memory by shared tags and similar title or content. Jev reorders the top 20 when AI_GATEWAY_API_KEY is set (fail-open to lexical order; never drops hits).",
    errorLabel: "Related memories failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(h.ctx, scopedMemory(h), async (scope) => {
        await loadMemoryForMcpScope(h.ctx, {
          clerkId: scope.clerkId,
          mcpScope: scope.mcpScope,
          profileId: scope.profileId,
          memoryId: params.memoryId,
        });
        return runForMcpScope(scope, {
          team: (profileId) =>
            relatedMemoriesForTeamProfile(h.ctx, {
              profileId,
              memoryId: params.memoryId,
            }),
          personal: ({ clerkId, profileId }) =>
            relatedMemoriesForClerk(h.ctx, {
              clerkId,
              profileId,
              memoryId: params.memoryId,
            }),
        });
      });
    },
  }),
};
