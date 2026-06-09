import { z } from "zod";

export const memoryTypeSchema = z.enum(["profile", "episodic", "knowledge"]);

export const memoryStatusSchema = z.enum([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

export const codebaseSymbolKindSchema = z.enum([
  "code-file",
  "code-function",
  "code-class",
  "code-interface",
  "code-process",
]);

export const codebaseImpactDirectionSchema = z.enum(["upstream", "downstream"]);

export const pingSchema = z.object({});

export const whoamiSchema = z.object({});

export const listProfilesSchema = z.object({});

export const setActiveProfileSchema = z.object({
  profileId: z.string().describe("Profile ID from list_profiles"),
});

export const memorySearchSchema = z.object({
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

export const memoryRetrieveSchema = z.object({
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

export const memoryAddSchema = z.object({
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
});

export const memoryAddInstructionSchema = z.object({
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

export const memoryUpdateSchema = z.object({
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
});

export const memoryDeleteSchema = z.object({
  id: z.string().describe("Memory ID to delete"),
});

export const memoryRelatedSchema = z.object({
  memoryId: z
    .string()
    .describe("Memory ID from memory_search or memory_retrieve"),
});

export const skillsListSchema = z.object({});

export const skillsGetSchema = z.object({
  name: z.string().describe("Exact skill name (case sensitive)"),
});

export const skillsCreateSchema = z.object({
  name: z.string().describe("Unique skill name"),
  description: z
    .string()
    .describe(
      "When to trigger this skill — the repeatable problem or workflow (shown in skills index)",
    ),
  instructions: z
    .string()
    .describe(
      "Markdown playbook: steps, checks, or automation the agent should follow when this skill applies",
    ),
});

export const skillsUpdateSchema = z.object({
  name: z.string().describe("Current skill name (exact, case sensitive)"),
  newName: z.string().optional().describe("New unique name (rename)"),
  description: z
    .string()
    .optional()
    .describe("Updated when-to-use description for the skills index"),
  instructions: z.string().optional().describe("Updated markdown playbook"),
  enabled: z
    .boolean()
    .optional()
    .describe("Set false to disable the skill, true to re-enable"),
});

export const skillsDeleteSchema = z.object({
  name: z.string().describe("Exact skill name to delete"),
});

export const wikiListSchema = z.object({});

export const wikiGetSchema = z.object({
  id: z.string().describe("Wiki node id from wiki_list"),
});

export const wikiSearchSchema = z.object({
  query: z.string().describe("Search text"),
});

export const wikiCreateSchema = z.object({
  kind: z.enum(["folder", "document"]).describe("folder or document"),
  title: z.string().describe("Node title"),
  parentId: z.string().optional().describe("Parent folder id (omit for root)"),
  contentMarkdown: z
    .string()
    .optional()
    .describe("Initial markdown body (documents only)"),
});

export const wikiUpdateSchema = z.object({
  id: z.string().describe("Wiki node id from wiki_list"),
  title: z.string().optional().describe("New title"),
  contentMarkdown: z
    .string()
    .optional()
    .describe("Markdown body to write or append"),
  contentMode: z
    .enum(["replace", "append"])
    .optional()
    .describe("replace (default) or append when contentMarkdown is set"),
});

export const wikiDeleteSchema = z.object({
  id: z.string().describe("Wiki node id from wiki_list"),
});

export const filesListSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Folder path to list (e.g. 'ai-images'). Omit to list the entire tree.",
    ),
});

export const filesGetSchema = z.object({
  path: z
    .string()
    .describe("File path, e.g. 'ai-images/cat.png' (from files_list)."),
});

export const filesUploadSchema = z.object({
  path: z
    .string()
    .describe(
      "Destination path, e.g. 'ai-images/cat.png'. Missing folders are auto-created; an existing file at this path is overwritten.",
    ),
  contentBase64: z
    .string()
    .optional()
    .describe(
      "Base64-encoded file bytes (data: URL prefix allowed). Provide this OR sourceUrl.",
    ),
  sourceUrl: z
    .string()
    .optional()
    .describe(
      "URL the server fetches and stores. Best for generated images/large files. Provide this OR contentBase64.",
    ),
  mimeType: z
    .string()
    .optional()
    .describe(
      "MIME type, e.g. 'image/png'. Inferred from the data URL or response Content-Type when omitted.",
    ),
});

export const filesDeleteSchema = z.object({
  path: z
    .string()
    .describe("File or folder path to delete. Folders delete recursively."),
});

export const codebasesListSchema = z.object({});

export const codebaseOverviewSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
});

export const codebaseSearchSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
  query: z.string().describe("Search text (name, path, or qualified name)"),
  kind: codebaseSymbolKindSchema
    .optional()
    .describe("Optional symbol kind filter"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max results (default 20)"),
});

export const codebaseContextSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
  symbolId: z
    .string()
    .describe("Symbol id from codebase_search or codebase_graph"),
});

export const codebaseImpactSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
  symbolId: z.string().describe("Starting symbol id"),
  direction: codebaseImpactDirectionSchema.describe(
    "upstream = who calls this symbol; downstream = what this symbol calls",
  ),
  depth: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe("Hop depth (default 3)"),
});

export const codebaseGraphSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
  kinds: z
    .array(codebaseSymbolKindSchema)
    .optional()
    .describe("Limit node kinds in the payload"),
  processId: z
    .string()
    .optional()
    .describe("Return only nodes/edges for one process"),
  blastRadiusOf: z
    .string()
    .optional()
    .describe("Center the graph on this symbol's blast radius"),
  blastDirection: codebaseImpactDirectionSchema
    .optional()
    .describe("Direction when blastRadiusOf is set"),
  blastDepth: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe("Hop depth when blastRadiusOf is set (default 2)"),
});
