import { z } from "zod";
import { internal } from "../_generated/api";
import { isOpenRouterRequired } from "../http/v1Memories/types";
import { scopedMemory, toolSpec } from "./toolTypes";

const memoryTypeSchema = z.enum(["profile", "episodic", "knowledge"]);

const memoryStatusSchema = z.enum([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

const memorySearchSchema = z.object({
  query: z.string().optional().describe("Text to search for"),
  type: memoryTypeSchema.optional().describe("Filter by memory type"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  source: z.string().optional().describe("Filter by source"),
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

const memoryRetrieveSchema = z.object({
  query: z
    .string()
    .describe("Natural language query to find relevant memories"),
  type: memoryTypeSchema.optional().describe("Filter by memory type"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID to search in (defaults to active profile)"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe("Max results (default 5)"),
});

const memoryAddSchema = z.object({
  title: z.string().describe("Short title for the memory"),
  content: z.string().describe("The memory content"),
  type: memoryTypeSchema.describe(
    "Memory type: profile, episodic, or knowledge",
  ),
  source: z
    .string()
    .describe(
      "Where this memory came from (e.g. 'claude', 'chatgpt', 'manual')",
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      "1-3 broad recurring THEME tags (lowercase-hyphenated, e.g. 'react', 'health'). Reuse tags you've seen on the user's existing memories; never mint hyper-specific one-offs — named people/products belong in the content, not tags. Omit to let server enrichment tag automatically.",
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

const memoryAddInstructionSchema = z.object({
  instruction: z
    .string()
    .describe(
      "What to remember, e.g. 'User prefers dark mode and uses pnpm for vmem'",
    ),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID (defaults to active MCP profile)"),
});

const memoryUpdateSchema = z.object({
  id: z.string().describe("Memory ID to update"),
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

const memoryDeleteSchema = z.object({
  id: z.string().describe("Memory ID to delete"),
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
      return h.ctx.runAction(internal.neo4jActions.mcp.mcpSearchMemories, {
        ...scopedMemory(h),
        query: params.query,
        type: params.type,
        tags: params.tags,
        limit: params.limit,
        offset: params.offset,
        profileId: params.profileId,
      });
    },
  }),
  memory_retrieve: toolSpec({
    name: "memory_retrieve",
    schema: memoryRetrieveSchema,
    description:
      "Retrieve the most relevant memories for a natural language query. Returns scored results with Context Trace explaining WHY each memory matched (score breakdown: fulltext, recency, confidence). Defaults to the active profile unless profileId is specified.",
    errorLabel: "Retrieve failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runAction(internal.neo4jActions.mcp.mcpRetrieveMemories, {
        ...scopedMemory(h),
        query: params.query,
        limit: params.limit,
        profileId: params.profileId,
      });
    },
  }),
  memory_add: toolSpec({
    name: "memory_add",
    schema: memoryAddSchema,
    description:
      "Store a new memory. Use type 'profile' for stable user facts, 'episodic' for past events/interactions, 'knowledge' for durable extracted knowledge. Adds to the active profile unless profileId is specified.",
    errorLabel: "Add memory failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runAction(internal.neo4jActions.mcp.mcpCreateMemory, {
        ...scopedMemory(h),
        title: params.title,
        content: params.content,
        type: params.type,
        source: params.source,
        tags: params.tags,
        confidence: params.confidence,
        profileId: params.profileId,
      });
    },
  }),
  memory_add_instruction: toolSpec({
    name: "memory_add_instruction",
    schema: memoryAddInstructionSchema,
    description:
      "Store memories from a natural-language instruction. The server extracts atomic facts with an LLM and creates one memory per fact (requires OpenRouter). Use when the agent should remember a conversation summary without drafting title/content itself. Prefer memory_add when you already have a single clear fact with title and type.",
    errorLabel: "Add from instruction failed",
    async run(h, params): Promise<unknown> {
      const data = await h.ctx.runAction(
        internal.neo4jActions.mcp.mcpAddFromInstruction,
        {
          ...scopedMemory(h),
          instruction: params.instruction,
          profileId: params.profileId,
        },
      );

      if (isOpenRouterRequired(data)) {
        throw new Error(
          "OpenRouter is required for instruction-based extraction. Add OPENROUTER_API_KEY in vmem settings.",
        );
      }

      return data;
    },
  }),
  memory_update: toolSpec({
    name: "memory_update",
    schema: memoryUpdateSchema,
    description:
      "Update an existing memory by ID. Only include fields you want to change.",
    errorLabel: "Update failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runAction(internal.neo4jActions.mcp.mcpUpdateMemory, {
        ...scopedMemory(h),
        memoryId: params.id,
        title: params.title,
        content: params.content,
        type: params.type,
        status: params.status,
        tags: params.tags,
        confidence: params.confidence,
      });
    },
  }),
  memory_delete: toolSpec({
    name: "memory_delete",
    schema: memoryDeleteSchema,
    description: "Delete a memory by ID. This is permanent.",
    errorLabel: "Delete failed",
    async run(h, params): Promise<unknown> {
      const deleted = await h.ctx.runAction(
        internal.neo4jActions.mcp.mcpDeleteMemory,
        {
          ...scopedMemory(h),
          memoryId: params.id,
        },
      );
      return { deleted };
    },
  }),
  memory_related: toolSpec({
    name: "memory_related",
    schema: memoryRelatedSchema,
    description:
      "List memories explicitly linked to a given memory via RELATES_TO edges (1-hop). Returns full memory bodies plus linkReason for each edge. Use after memory_retrieve when you need all structural neighbors of one memory, not query-ranked top-k.",
    errorLabel: "Related memories failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runAction(internal.neo4jActions.mcp.mcpGetRelatedMemories, {
        ...scopedMemory(h),
        memoryId: params.memoryId,
      });
    },
  }),
};
