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
import { scopedMemory, toolSpec } from "./toolTypes";
import {
  loadMemoryForMcpScope,
  runForMcpScope,
  withMcpMemoryScope,
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
  updateMemoryForClerk,
} from "../memoryRuntime";

const memorySearchSchema = z.object({
  query: z.string().optional().describe("Text to search for"),
  type: memoryTypeSchema.optional().describe("Filter by memory type"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
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
  .omit({ summarize: true })
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
      .boolean()
      .optional()
      .describe(
        "Optional lightweight rerank of the top 20 hits; keeps Context Trace legs",
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

const memoryRelatedSchema = z.object({
  memoryId: z
    .string()
    .describe("Memory ID from memory_search or memory_retrieve"),
});

export const memoryToolSpecs = {
  memory_search: toolSpec({
    name: "memory_search",
    schema: memorySearchSchema,
    description:
      "Search your memories by query text, type, tags, or source. Returns matching memories with metadata. Defaults to the active profile unless profileId is specified.",
    errorLabel: "Search failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        (scope) => {
          const limit = params.limit ?? 20;
          const offset = params.offset ?? 0;
          return runForMcpScope(scope, {
            team: (profileId) =>
              listMemoriesForTeamProfile(h.ctx, {
                profileId,
                type: params.type,
                tags: params.tags,
                source: params.source,
                searchQuery: params.query,
                limit,
                offset,
              }),
            personal: ({ clerkId, profileId }) =>
              listMemoriesForClerk(h.ctx, {
                clerkId,
                profileId,
                type: params.type,
                tags: params.tags,
                source: params.source,
                searchQuery: params.query,
                limit,
                offset,
              }),
          });
        },
      );
    },
  }),
  memory_retrieve: toolSpec({
    name: "memory_retrieve",
    schema: memoryRetrieveSchema,
    description:
      "Retrieve the most relevant memories for a query using hybrid full-text, synonym, recency, temporal, and optional vector ranking. type, tags, status, and source filters are applied before ranking. Optional threshold / rerank keep the Context Trace. Defaults to the active profile unless profileId is specified.",
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
      "Store a new memory. Use type 'profile' for stable user facts, 'episodic' for past events/interactions, 'knowledge' for durable extracted knowledge. Adds to the active profile unless profileId is specified.",
    errorLabel: "Add memory failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        (scope) =>
          createMemoryForClerk(h.ctx, {
            clerkId: scope.clerkId,
            profileId: scope.profileId,
            title: params.title,
            content: params.content,
            type: toMemoryType(params.type) ?? "knowledge",
            source: params.source ?? "mcp",
            tags: params.tags ?? [],
            confidence: params.confidence ?? 1.0,
          }),
      );
    },
  }),
  memory_add_instruction: toolSpec({
    name: "memory_add_instruction",
    schema: memoryAddInstructionSchema,
    description:
      "Store a memory from a natural-language instruction. Requires OPENROUTER_API_KEY; fails with openrouter_required without it. Exact duplicates are skipped; near-duplicates supersede the prior row. Prefer memory_add when you already have a single clear fact with title and type.",
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
      return withMcpMemoryScope(h.ctx, scopedMemory(h), async (scope) => {
        const memory = await loadMemoryForMcpScope(h.ctx, {
          clerkId: scope.clerkId,
          mcpScope: scope.mcpScope,
          profileId: scope.profileId,
          memoryId: params.id,
        });
        return updateMemoryForClerk(h.ctx, {
          clerkId: memory.userId,
          memoryId: params.id,
          title: params.title,
          content: params.content,
          type: toMemoryType(params.type),
          status: toMemoryStatus(params.status),
          tags: params.tags,
          confidence: params.confidence,
        });
      });
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
  memory_related: toolSpec({
    name: "memory_related",
    schema: memoryRelatedSchema,
    description:
      "List memories related to a given memory by shared tags and similar title or content.",
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
