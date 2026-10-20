import { toolSpecs } from "../../convex/mcp/toolCatalog";
import type { McpScope } from "../../convex/profiles/mcpAccess";

export const MEMORY_GRAPH_TOOL = "memory_graph";

export const CONTEXT_TOOL_NAMES = ["context_pack"] as const;

export const MEMORY_TOOL_NAMES = [
  "memory_search",
  "memory_retrieve",
  "memory_add",
  "memory_add_batch",
  "memory_get",
  "memory_add_instruction",
  "memory_update",
  "memory_delete",
  "memory_related",
] as const;

export const MEMORY_MANAGE_TOOL_NAMES = [
  "memory_facets",
  "memory_tag_rename",
  "memory_tag_delete",
  "memory_link",
  "memory_unlink",
  "memory_history",
  "memory_topic_timeline",
  "memory_stats",
  "memory_import_file",
] as const;

export const INBOX_TOOL_NAMES = [
  "proposals_list",
  "proposals_resolve",
  "dream_run",
  "notifications_list",
  "notifications_mark",
  "notifications_mark_all_read",
  "notifications_delete",
] as const;

// inbox tools that act on the user, not a profile: personal connector only
export const PERSONAL_ONLY_INBOX_TOOL_NAMES = [
  "dream_run",
  "notifications_list",
  "notifications_mark",
  "notifications_mark_all_read",
  "notifications_delete",
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
  "skills_import",
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
