import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import {
  searchMemories,
  retrieveMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  listSkills,
  getSkill,
  whoami,
} from "./api-client.js";

const memoryTypeSchema = z.enum(["profile", "episodic", "knowledge"]);
const memoryStatusSchema = z.enum([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerTools(
  server: McpServer,
  user: AuthenticatedUser,
): void {
  server.tool(
    "ping",
    "Health check tool for connector validation.",
    {},
    async () => {
      return textContent(
        JSON.stringify({ ok: true, timestamp: new Date().toISOString() }),
      );
    },
  );

  server.tool(
    "whoami",
    "Returns the authenticated user ID and active profile for the current session.",
    {},
    async () => {
      const result = await whoami(user.token);
      if (!result.ok) {
        return errorContent(
          `Whoami failed (${result.status}): ${result.message}`,
        );
      }
      return textContent(result.text);
    },
  );

  server.tool(
    "memory_search",
    "Search your memories by query text, type, tags, or source. Returns matching memories with metadata. Defaults to the active profile unless profileId is specified.",
    {
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
    },
    async (params) => {
      const result = await searchMemories(user.token, params);
      if (!result.ok) {
        return errorContent(
          `Search failed (${result.status}): ${result.message}`,
        );
      }
      return textContent(result.text);
    },
  );

  server.tool(
    "memory_retrieve",
    "Retrieve the most relevant memories for a natural language query. Returns scored results with Context Trace explaining WHY each memory matched (score breakdown: fulltext, recency, confidence). Defaults to the active profile unless profileId is specified.",
    {
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
    },
    async (params) => {
      const result = await retrieveMemories(user.token, params);
      if (!result.ok) {
        return errorContent(
          `Retrieve failed (${result.status}): ${result.message}`,
        );
      }
      return textContent(result.text);
    },
  );

  server.tool(
    "memory_add",
    "Store a new memory. Use type 'profile' for stable user facts, 'episodic' for past events/interactions, 'knowledge' for durable extracted knowledge. Adds to the active profile unless profileId is specified.",
    {
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
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
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
    },
    async (params) => {
      const result = await addMemory(user.token, params);
      if (!result.ok) {
        return errorContent(
          `Add memory failed (${result.status}): ${result.message}`,
        );
      }
      return textContent(result.text);
    },
  );

  server.tool(
    "memory_update",
    "Update an existing memory by ID. Only include fields you want to change.",
    {
      id: z.string().describe("Memory ID to update"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New content"),
      type: memoryTypeSchema.optional().describe("New type"),
      status: memoryStatusSchema
        .optional()
        .describe("New status: active, pinned, suppressed, expired"),
      tags: z.array(z.string()).optional().describe("New tags (replaces all)"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("New confidence score"),
    },
    async (params) => {
      const { id, ...body } = params;
      const result = await updateMemory(user.token, id, body);
      if (!result.ok) {
        return errorContent(
          `Update failed (${result.status}): ${result.message}`,
        );
      }
      return textContent(result.text);
    },
  );

  server.tool(
    "memory_delete",
    "Delete a memory by ID. This is permanent.",
    {
      id: z.string().describe("Memory ID to delete"),
    },
    async (params) => {
      const result = await deleteMemory(user.token, params.id);
      if (!result.ok) {
        return errorContent(
          `Delete failed (${result.status}): ${result.message}`,
        );
      }
      return textContent(result.text);
    },
  );

  server.tool(
    "skills_list",
    "List all skills authored by the authenticated user. A skill is a reusable instruction module (name, description, markdown instructions) that the agent can consult. Returns the full list so you can decide which skill to apply.",
    {},
    async () => {
      const result = await listSkills(user.token);
      if (!result.ok) {
        return errorContent(
          `List skills failed (${result.status}): ${result.message}`,
        );
      }
      return textContent(result.text);
    },
  );

  server.tool(
    "skills_get",
    "Fetch a single skill by its exact name. Returns the full skill including its markdown instructions so you can follow them.",
    {
      name: z.string().describe("Exact skill name (case sensitive)"),
    },
    async (params) => {
      const result = await getSkill(user.token, params.name);
      if (!result.ok) {
        return errorContent(
          `Get skill failed (${result.status}): ${result.message}`,
        );
      }
      return textContent(result.text);
    },
  );
}
