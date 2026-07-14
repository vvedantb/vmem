import type { z } from "zod";
import type { McpScope } from "../profiles/mcpAccess";
import {
  filesGetContent,
  type McpToolContent,
  type ToolHandlerResult,
} from "./content";
import type { ToolHandlerContext } from "./toolHandlers";
import {
  runCodebaseContext,
  runCodebaseGraph,
  runCodebaseImpact,
  runCodebaseOverview,
  runCodebaseSearch,
  runCodebasesList,
  runContextPromptGet,
  runFilesDelete,
  runFilesGet,
  runFilesList,
  runFilesUpload,
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
} from "./toolHandlers";
import {
  codebaseContextSchema,
  codebaseGraphSchema,
  codebaseImpactSchema,
  codebaseOverviewSchema,
  codebaseSearchSchema,
  codebasesListSchema,
  contextPromptGetSchema,
  filesDeleteSchema,
  filesGetSchema,
  filesListSchema,
  filesUploadSchema,
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
} from "./schemas";

interface ToolSpec<Shape extends z.ZodRawShape> {
  readonly name: string;
  readonly schema: z.ZodObject<Shape>;
  readonly description: string | ((scopeLabel: string) => string);
  readonly errorLabel: string;
  /** Omit to register on every MCP scope. */
  readonly scopes?: readonly McpScope[];
  readonly toContent?: (result: ToolHandlerResult) => McpToolContent;
  // Method syntax: bivariant params so ToolSpec<> erases into ErasedToolSpec.
  run(
    h: ToolHandlerContext,
    params: z.infer<z.ZodObject<Shape>>,
  ): Promise<unknown>;
}

function toolSpec<Shape extends z.ZodRawShape>(
  spec: ToolSpec<Shape>,
): ToolSpec<Shape> {
  return spec;
}

export const toolSpecs = {
  ping: toolSpec({
    name: "ping",
    schema: pingSchema,
    description: "Health check tool for connector validation.",
    errorLabel: "Ping failed",
    run: runPing,
  }),
  whoami: toolSpec({
    name: "whoami",
    schema: whoamiSchema,
    description: (scopeLabel) =>
      `Returns the authenticated user, active ${scopeLabel} profile, and profiles visible on this ${scopeLabel} MCP connector.`,
    errorLabel: "Whoami failed",
    run: runWhoami,
  }),
  list_profiles: toolSpec({
    name: "list_profiles",
    schema: listProfilesSchema,
    description: (scopeLabel) =>
      `List ${scopeLabel} profiles available on this MCP connector. Returns profile IDs, names, colors, and icons. Use set_active_profile to choose the default profile for memory tools, or pass profileId on memory_add / memory_search / memory_retrieve.`,
    errorLabel: "List profiles failed",
    run: runListProfiles,
  }),
  set_active_profile: toolSpec({
    name: "set_active_profile",
    schema: setActiveProfileSchema,
    description: (scopeLabel) =>
      `Set the default ${scopeLabel} profile for MCP memory tools (memory_add, memory_search, memory_retrieve when profileId is omitted). Call list_profiles first to get valid profile IDs.`,
    errorLabel: "Set active profile failed",
    run: runSetActiveProfile,
  }),
  context_prompt_get: toolSpec({
    name: "context_prompt_get",
    schema: contextPromptGetSchema,
    description:
      "Returns the full vmem user profile markdown (same as MCP resource vmem://context_prompt): About, Preferences, pinned memories, profile summary, and Available Skills (name + description). Call at session start or when a skill might apply — claude.ai cannot re-read the resource mid-chat. Then call skills_get with the exact skill name to load the playbook.",
    errorLabel: "Context prompt get failed",
    scopes: ["personal"],
    run: runContextPromptGet,
  }),
  memory_search: toolSpec({
    name: "memory_search",
    schema: memorySearchSchema,
    description:
      "Search your memories by query text, type, tags, or source. Returns matching memories with metadata. Defaults to the active profile unless profileId is specified.",
    errorLabel: "Search failed",
    run: runMemorySearch,
  }),
  memory_retrieve: toolSpec({
    name: "memory_retrieve",
    schema: memoryRetrieveSchema,
    description:
      "Retrieve the most relevant memories for a natural language query. Returns scored results with Context Trace explaining WHY each memory matched (score breakdown: fulltext, recency, confidence). Defaults to the active profile unless profileId is specified.",
    errorLabel: "Retrieve failed",
    run: runMemoryRetrieve,
  }),
  memory_add: toolSpec({
    name: "memory_add",
    schema: memoryAddSchema,
    description:
      "Store a new memory. Use type 'profile' for stable user facts, 'episodic' for past events/interactions, 'knowledge' for durable extracted knowledge. Adds to the active profile unless profileId is specified.",
    errorLabel: "Add memory failed",
    run: runMemoryAdd,
  }),
  memory_add_instruction: toolSpec({
    name: "memory_add_instruction",
    schema: memoryAddInstructionSchema,
    description:
      "Store memories from a natural-language instruction. The server extracts atomic facts with an LLM and creates one memory per fact (requires OpenRouter). Use when the agent should remember a conversation summary without drafting title/content itself. Prefer memory_add when you already have a single clear fact with title and type.",
    errorLabel: "Add from instruction failed",
    run: runMemoryAddInstruction,
  }),
  memory_update: toolSpec({
    name: "memory_update",
    schema: memoryUpdateSchema,
    description:
      "Update an existing memory by ID. Only include fields you want to change.",
    errorLabel: "Update failed",
    run: runMemoryUpdate,
  }),
  memory_delete: toolSpec({
    name: "memory_delete",
    schema: memoryDeleteSchema,
    description: "Delete a memory by ID. This is permanent.",
    errorLabel: "Delete failed",
    run: runMemoryDelete,
  }),
  memory_related: toolSpec({
    name: "memory_related",
    schema: memoryRelatedSchema,
    description:
      "List memories explicitly linked to a given memory via RELATES_TO edges (1-hop). Returns full memory bodies plus linkReason for each edge. Use after memory_retrieve when you need all structural neighbors of one memory, not query-ranked top-k.",
    errorLabel: "Related memories failed",
    run: runMemoryRelated,
  }),
  skills_list: toolSpec({
    name: "skills_list",
    schema: skillsListSchema,
    description:
      "List enabled skills (name + description only). Same data as the Available Skills section in context_prompt_get / vmem://context_prompt. When a task matches a skill's description, call skills_get with the exact name to load full markdown instructions before following them.",
    errorLabel: "List skills failed",
    scopes: ["personal"],
    run: runSkillsList,
  }),
  skills_get: toolSpec({
    name: "skills_get",
    schema: skillsGetSchema,
    description:
      "Fetch a single enabled skill by exact name, including full markdown instructions. Call after identifying a matching skill from context_prompt_get, skills_list, or the Available Skills section in vmem://context_prompt.",
    errorLabel: "Get skill failed",
    scopes: ["personal"],
    run: runSkillsGet,
  }),
  skills_create: toolSpec({
    name: "skills_create",
    schema: skillsCreateSchema,
    description:
      "Create a new enabled skill when you have identified a repeatable problem or a workflow that could be automated with a skill, and no existing skill already covers it (check Available Skills in vmem://context_prompt or call skills_list first). Write markdown instructions so future sessions can follow the same fix or automation. Do not create duplicates — if a similar skill exists, use skills_get and skills_update instead. Names must be unique per user (trimmed).",
    errorLabel: "Create skill failed",
    scopes: ["personal"],
    run: runSkillsCreate,
  }),
  skills_update: toolSpec({
    name: "skills_update",
    schema: skillsUpdateSchema,
    description:
      "Update an existing skill when its playbook should change — e.g. after fixing a repeatable problem, refining steps, or improving an automation. Call skills_get first to read the current skill. Provide the skill's current exact name (case sensitive) plus at least one field to change. Use newName to rename; use enabled false to disable without deleting.",
    errorLabel: "Update skill failed",
    scopes: ["personal"],
    run: runSkillsUpdate,
  }),
  skills_delete: toolSpec({
    name: "skills_delete",
    schema: skillsDeleteSchema,
    description:
      "Permanently delete a skill by exact name (case sensitive). Call skills_get first if unsure of the name. Prefer skills_update with enabled false to hide a skill without deleting it.",
    errorLabel: "Delete skill failed",
    scopes: ["personal"],
    run: runSkillsDelete,
  }),
  wiki_list: toolSpec({
    name: "wiki_list",
    schema: wikiListSchema,
    description:
      "List all wiki folders and documents (flat index, no body). Use returned ids with wiki_get. Call this before wiki_get or wiki_update when you do not already have a node id.",
    errorLabel: "Wiki list failed",
    scopes: ["personal"],
    run: runWikiList,
  }),
  wiki_get: toolSpec({
    name: "wiki_get",
    schema: wikiGetSchema,
    description:
      "Fetch a single wiki node by id. Returns metadata and contentMarkdown for documents. Call wiki_list first if you do not have the id.",
    errorLabel: "Wiki get failed",
    scopes: ["personal"],
    run: runWikiGet,
  }),
  wiki_search: toolSpec({
    name: "wiki_search",
    schema: wikiSearchSchema,
    description:
      "Full-text search wiki titles and document bodies. Returns id, title, kind, and excerpt.",
    errorLabel: "Wiki search failed",
    scopes: ["personal"],
    run: runWikiSearch,
  }),
  wiki_create: toolSpec({
    name: "wiki_create",
    schema: wikiCreateSchema,
    description:
      "Create a wiki folder or document. Documents accept contentMarkdown stored as canonical markdown (same as the web editor). Optional parentId must be a folder id from wiki_list.",
    errorLabel: "Wiki create failed",
    scopes: ["personal"],
    run: runWikiCreate,
  }),
  wiki_update: toolSpec({
    name: "wiki_update",
    schema: wikiUpdateSchema,
    description:
      "Update a wiki node by id. Optional title and/or contentMarkdown. contentMode append concatenates new markdown after existing body; replace (default) overwrites the body.",
    errorLabel: "Wiki update failed",
    scopes: ["personal"],
    run: runWikiUpdate,
  }),
  wiki_delete: toolSpec({
    name: "wiki_delete",
    schema: wikiDeleteSchema,
    description:
      "Permanently delete a wiki folder or document by id. Deleting a folder removes all descendants. Call wiki_list or wiki_get first to confirm the id.",
    errorLabel: "Wiki delete failed",
    scopes: ["personal"],
    run: runWikiDelete,
  }),
  files_list: toolSpec({
    name: "files_list",
    schema: filesListSchema,
    description:
      "List files and folders in the shared filesystem. Paths are '/'-separated (e.g. 'ai-images/cat.png'). Omit path to list the entire tree; pass a folder path to list its direct children. Files are user-wide and shared across all your AI clients.",
    errorLabel: "Files list failed",
    scopes: ["personal"],
    run: runFilesList,
  }),
  files_get: toolSpec({
    name: "files_get",
    schema: filesGetSchema,
    description:
      "Read a file by path. Images up to 4 MB are returned as an inline image block (rendered directly); text files up to 100 KB are returned inline. A downloadUrl is always included for larger files. Call files_list first if you don't know the path.",
    errorLabel: "Files get failed",
    scopes: ["personal"],
    toContent: filesGetContent,
    run: runFilesGet,
  }),
  files_upload: toolSpec({
    name: "files_upload",
    schema: filesUploadSchema,
    description:
      "Save a file to the shared filesystem at the given path. Provide either contentBase64 (inline bytes, data: URL allowed) or sourceUrl (the server fetches and stores it — best for generated images). Missing parent folders are auto-created; an existing file at the path is overwritten. Max 10 MB. PDF and text-like files are automatically indexed into the memory graph and appear in memory_search/memory_retrieve.",
    errorLabel: "Files upload failed",
    scopes: ["personal"],
    run: runFilesUpload,
  }),
  files_delete: toolSpec({
    name: "files_delete",
    schema: filesDeleteSchema,
    description:
      "Delete a file or folder by path. Folders are deleted recursively along with their stored contents. This is permanent.",
    errorLabel: "Files delete failed",
    scopes: ["personal"],
    run: runFilesDelete,
  }),
  codebases_list: toolSpec({
    name: "codebases_list",
    schema: codebasesListSchema,
    description:
      "List GitHub repositories connected to vmem. Returns codebase IDs, repo names, sync status, and parser stats. Call this first to discover codebaseId values for the other codebase_* tools. Only repos with status 'synced' have graph data in Neo4j.",
    errorLabel: "List codebases failed",
    scopes: ["personal"],
    run: runCodebasesList,
  }),
  codebase_overview: toolSpec({
    name: "codebase_overview",
    schema: codebaseOverviewSchema,
    description:
      "Get aggregate stats for a synced codebase: file, function, class, interface, and process counts plus CALLS and IMPORTS edge counts.",
    errorLabel: "Codebase overview failed",
    scopes: ["personal"],
    run: runCodebaseOverview,
  }),
  codebase_search: toolSpec({
    name: "codebase_search",
    schema: codebaseSearchSchema,
    description:
      "Search symbols (files, functions, classes, interfaces, processes) inside a synced codebase. Use the returned symbol id with codebase_context or codebase_impact.",
    errorLabel: "Codebase search failed",
    scopes: ["personal"],
    run: runCodebaseSearch,
  }),
  codebase_context: toolSpec({
    name: "codebase_context",
    schema: codebaseContextSchema,
    description:
      "Get a symbol's metadata plus its direct CALLS relationships (callers and callees) and linked processes.",
    errorLabel: "Codebase context failed",
    scopes: ["personal"],
    run: runCodebaseContext,
  }),
  codebase_impact: toolSpec({
    name: "codebase_impact",
    schema: codebaseImpactSchema,
    description:
      "Traverse CALLS edges upstream (callers) or downstream (callees) from a symbol to estimate blast radius.",
    errorLabel: "Codebase impact failed",
    scopes: ["personal"],
    run: runCodebaseImpact,
  }),
  codebase_graph: toolSpec({
    name: "codebase_graph",
    schema: codebaseGraphSchema,
    description:
      "Fetch a filtered subgraph of a synced codebase: nodes plus relationship edges (imports, calls, contains, extends, implements, process links). Response may be truncated on large repos — use kinds, processId, or blastRadiusOf to narrow scope.",
    errorLabel: "Codebase graph failed",
    scopes: ["personal"],
    run: runCodebaseGraph,
  }),
};

export type McpBindableTool = {
  readonly name: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  readonly run: (
    h: ToolHandlerContext,
    params: z.infer<z.ZodObject<z.ZodRawShape>>,
  ) => Promise<unknown>;
};

/** Structural erase of ToolSpec<> so heterogeneous catalog entries can bind. */
type ErasedToolSpec = {
  readonly name: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  // Method syntax keeps `run` bivariant so specific ToolSpec shapes assign here.
  run(
    h: ToolHandlerContext,
    params: z.infer<z.ZodObject<z.ZodRawShape>>,
  ): Promise<unknown>;
};

export function bindToolSpec(spec: ErasedToolSpec): McpBindableTool {
  return {
    name: spec.name,
    schema: spec.schema,
    run: (h, params) => spec.run(h, spec.schema.parse(params)),
  };
}

export const bindableToolSpecs = Object.fromEntries(
  Object.entries(toolSpecs).map(([key, spec]) => [key, bindToolSpec(spec)]),
) satisfies Record<string, McpBindableTool>;
