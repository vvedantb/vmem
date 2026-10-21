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
  "skills_history",
  "skills_version_get",
  "skills_restore_version",
  "skills_catalog_list",
  "skills_catalog_install",
  "skills_catalog_uninstall",
  "skills_catalog_set_enabled",
] as const;

export const FILES_TOOL_NAMES = [
  "files_list",
  "files_storage",
  "files_get",
  "files_upload",
  "files_delete",
  "files_create_folder",
  "files_rename",
  "files_move",
] as const;

export const PROFILES_TOOL_NAMES = [
  "profiles_create",
  "profiles_update",
  "profiles_delete",
] as const;

export const TEAMS_TOOL_NAMES = [
  "teams_list",
  "teams_get",
  "teams_create",
  "teams_rename",
  "teams_leave",
  "teams_add_member",
  "teams_remove_member",
  "teams_delete",
] as const;

export const SETTINGS_TOOL_NAMES = [
  "settings_get",
  "settings_update",
  "dream_schedule_set",
  "settings_set_experimental_flag",
] as const;

export const CONNECTORS_TOOL_NAMES = [
  "connectors_list",
  "connectors_sync",
  "connectors_disconnect",
  "connectors_delete_data",
] as const;

export const USAGE_TOOL_NAMES = [
  "usage_ai_logs",
  "usage_ai_summary",
  "usage_ai_models",
  "usage_api_requests",
] as const;

// user-wide tools (not tied to a profile or team): personal connector only
export const PERSONAL_ONLY_ACCOUNT_TOOL_NAMES = [
  "profiles_create",
  "profiles_delete",
  ...SETTINGS_TOOL_NAMES,
  ...CONNECTORS_TOOL_NAMES,
  "usage_api_requests",
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
