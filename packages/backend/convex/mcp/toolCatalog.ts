import type { z } from "zod";
import type { ToolHandlerContext, ToolHandlerResult } from "./toolHandlers";
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
  readonly run: (
    h: ToolHandlerContext,
    params: z.infer<z.ZodObject<Shape>>,
  ) => Promise<ToolHandlerResult>;
}

function toolSpec<Shape extends z.ZodRawShape>(
  spec: ToolSpec<Shape>,
): ToolSpec<Shape> {
  return spec;
}

export const toolSpecs = {
  ping: toolSpec({ name: "ping", schema: pingSchema, run: runPing }),
  whoami: toolSpec({ name: "whoami", schema: whoamiSchema, run: runWhoami }),
  list_profiles: toolSpec({
    name: "list_profiles",
    schema: listProfilesSchema,
    run: runListProfiles,
  }),
  set_active_profile: toolSpec({
    name: "set_active_profile",
    schema: setActiveProfileSchema,
    run: runSetActiveProfile,
  }),
  context_prompt_get: toolSpec({
    name: "context_prompt_get",
    schema: contextPromptGetSchema,
    run: runContextPromptGet,
  }),
  memory_search: toolSpec({
    name: "memory_search",
    schema: memorySearchSchema,
    run: runMemorySearch,
  }),
  memory_retrieve: toolSpec({
    name: "memory_retrieve",
    schema: memoryRetrieveSchema,
    run: runMemoryRetrieve,
  }),
  memory_add: toolSpec({
    name: "memory_add",
    schema: memoryAddSchema,
    run: runMemoryAdd,
  }),
  memory_add_instruction: toolSpec({
    name: "memory_add_instruction",
    schema: memoryAddInstructionSchema,
    run: runMemoryAddInstruction,
  }),
  memory_update: toolSpec({
    name: "memory_update",
    schema: memoryUpdateSchema,
    run: runMemoryUpdate,
  }),
  memory_delete: toolSpec({
    name: "memory_delete",
    schema: memoryDeleteSchema,
    run: runMemoryDelete,
  }),
  memory_related: toolSpec({
    name: "memory_related",
    schema: memoryRelatedSchema,
    run: runMemoryRelated,
  }),
  skills_list: toolSpec({
    name: "skills_list",
    schema: skillsListSchema,
    run: runSkillsList,
  }),
  skills_get: toolSpec({
    name: "skills_get",
    schema: skillsGetSchema,
    run: runSkillsGet,
  }),
  skills_create: toolSpec({
    name: "skills_create",
    schema: skillsCreateSchema,
    run: runSkillsCreate,
  }),
  skills_update: toolSpec({
    name: "skills_update",
    schema: skillsUpdateSchema,
    run: runSkillsUpdate,
  }),
  skills_delete: toolSpec({
    name: "skills_delete",
    schema: skillsDeleteSchema,
    run: runSkillsDelete,
  }),
  wiki_list: toolSpec({
    name: "wiki_list",
    schema: wikiListSchema,
    run: runWikiList,
  }),
  wiki_get: toolSpec({
    name: "wiki_get",
    schema: wikiGetSchema,
    run: runWikiGet,
  }),
  wiki_search: toolSpec({
    name: "wiki_search",
    schema: wikiSearchSchema,
    run: runWikiSearch,
  }),
  wiki_create: toolSpec({
    name: "wiki_create",
    schema: wikiCreateSchema,
    run: runWikiCreate,
  }),
  wiki_update: toolSpec({
    name: "wiki_update",
    schema: wikiUpdateSchema,
    run: runWikiUpdate,
  }),
  wiki_delete: toolSpec({
    name: "wiki_delete",
    schema: wikiDeleteSchema,
    run: runWikiDelete,
  }),
  files_list: toolSpec({
    name: "files_list",
    schema: filesListSchema,
    run: runFilesList,
  }),
  files_get: toolSpec({
    name: "files_get",
    schema: filesGetSchema,
    run: runFilesGet,
  }),
  files_upload: toolSpec({
    name: "files_upload",
    schema: filesUploadSchema,
    run: runFilesUpload,
  }),
  files_delete: toolSpec({
    name: "files_delete",
    schema: filesDeleteSchema,
    run: runFilesDelete,
  }),
  codebases_list: toolSpec({
    name: "codebases_list",
    schema: codebasesListSchema,
    run: runCodebasesList,
  }),
  codebase_overview: toolSpec({
    name: "codebase_overview",
    schema: codebaseOverviewSchema,
    run: runCodebaseOverview,
  }),
  codebase_search: toolSpec({
    name: "codebase_search",
    schema: codebaseSearchSchema,
    run: runCodebaseSearch,
  }),
  codebase_context: toolSpec({
    name: "codebase_context",
    schema: codebaseContextSchema,
    run: runCodebaseContext,
  }),
  codebase_impact: toolSpec({
    name: "codebase_impact",
    schema: codebaseImpactSchema,
    run: runCodebaseImpact,
  }),
  codebase_graph: toolSpec({
    name: "codebase_graph",
    schema: codebaseGraphSchema,
    run: runCodebaseGraph,
  }),
};

export type McpBindableTool = {
  readonly name: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  readonly run: (
    h: ToolHandlerContext,
    params: z.infer<z.ZodObject<z.ZodRawShape>>,
  ) => Promise<ToolHandlerResult>;
};

export function bindToolSpec<Shape extends z.ZodRawShape>(
  spec: ToolSpec<Shape>,
): McpBindableTool {
  return {
    name: spec.name,
    schema: spec.schema,
    run: (h, params) => spec.run(h, spec.schema.parse(params)),
  };
}

export const bindableToolSpecs = {
  ping: bindToolSpec(toolSpecs.ping),
  whoami: bindToolSpec(toolSpecs.whoami),
  list_profiles: bindToolSpec(toolSpecs.list_profiles),
  set_active_profile: bindToolSpec(toolSpecs.set_active_profile),
  context_prompt_get: bindToolSpec(toolSpecs.context_prompt_get),
  memory_search: bindToolSpec(toolSpecs.memory_search),
  memory_retrieve: bindToolSpec(toolSpecs.memory_retrieve),
  memory_add: bindToolSpec(toolSpecs.memory_add),
  memory_add_instruction: bindToolSpec(toolSpecs.memory_add_instruction),
  memory_update: bindToolSpec(toolSpecs.memory_update),
  memory_delete: bindToolSpec(toolSpecs.memory_delete),
  memory_related: bindToolSpec(toolSpecs.memory_related),
  skills_list: bindToolSpec(toolSpecs.skills_list),
  skills_get: bindToolSpec(toolSpecs.skills_get),
  skills_create: bindToolSpec(toolSpecs.skills_create),
  skills_update: bindToolSpec(toolSpecs.skills_update),
  skills_delete: bindToolSpec(toolSpecs.skills_delete),
  wiki_list: bindToolSpec(toolSpecs.wiki_list),
  wiki_get: bindToolSpec(toolSpecs.wiki_get),
  wiki_search: bindToolSpec(toolSpecs.wiki_search),
  wiki_create: bindToolSpec(toolSpecs.wiki_create),
  wiki_update: bindToolSpec(toolSpecs.wiki_update),
  wiki_delete: bindToolSpec(toolSpecs.wiki_delete),
  files_list: bindToolSpec(toolSpecs.files_list),
  files_get: bindToolSpec(toolSpecs.files_get),
  files_upload: bindToolSpec(toolSpecs.files_upload),
  files_delete: bindToolSpec(toolSpecs.files_delete),
  codebases_list: bindToolSpec(toolSpecs.codebases_list),
  codebase_overview: bindToolSpec(toolSpecs.codebase_overview),
  codebase_search: bindToolSpec(toolSpecs.codebase_search),
  codebase_context: bindToolSpec(toolSpecs.codebase_context),
  codebase_impact: bindToolSpec(toolSpecs.codebase_impact),
  codebase_graph: bindToolSpec(toolSpecs.codebase_graph),
} satisfies Record<keyof typeof toolSpecs, McpBindableTool>;
