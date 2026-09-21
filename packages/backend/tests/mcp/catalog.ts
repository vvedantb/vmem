import { toolSpecs } from "../../convex/mcp/toolCatalog";
import type { McpScope } from "../../convex/profiles/mcpAccess";

export const MEMORY_GRAPH_TOOL = "memory_graph";

export const MEMORY_TOOL_NAMES = [
  "memory_search",
  "memory_retrieve",
  "memory_add",
  "memory_add_instruction",
  "memory_update",
  "memory_delete",
  "memory_related",
] as const;

export const CORE_TOOL_NAMES = [
  "ping",
  "whoami",
  "list_profiles",
  "set_active_profile",
  "context_prompt_get",
] as const;

export const SKILLS_TOOL_NAMES = [
  "skills_list",
  "skills_recommend",
  "skills_get",
  "skills_create",
  "skills_update",
  "skills_delete",
] as const;

export const WIKI_TOOL_NAMES = [
  "wiki_list",
  "wiki_get",
  "wiki_search",
  "wiki_create",
  "wiki_update",
  "wiki_delete",
] as const;

export const FILES_TOOL_NAMES = [
  "files_list",
  "files_get",
  "files_upload",
  "files_delete",
] as const;

export function catalogNamesForScope(scope: McpScope): string[] {
  const names: string[] = [];
  for (const spec of Object.values(toolSpecs)) {
    if (spec.scopes !== undefined && !spec.scopes.includes(scope)) continue;
    names.push(spec.name);
  }
  names.push(MEMORY_GRAPH_TOOL);
  return names;
}
