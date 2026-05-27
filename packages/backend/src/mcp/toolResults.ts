import type { FunctionReturnType } from "convex/server";
import type { internal } from "../../convex/_generated/api";
import type { OpenRouterRequired } from "../../convex/neo4jActions/agent/shared";
import type { StoreFromInstructionResult } from "../../convex/neo4jActions/agent/storeFromInstruction";

export type { StoreFromInstructionResult };
import type { McpScope } from "../../convex/profiles/mcpAccess";

export type ToolHandlerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function formatToolResult<T>(result: ToolHandlerResult<T>): string {
  if (!result.ok) {
    return JSON.stringify({ error: result.error }, null, 2);
  }
  return JSON.stringify(result.data, null, 2);
}

export async function safe<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ToolHandlerResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[MCP][${label}]`, message);
    return { ok: false, error: message };
  }
}

export interface PingToolData {
  ok: true;
  scope: McpScope;
  timestamp: string;
}

export type MemoryDeleteToolData = { deleted: boolean };

export type McpWhoamiResult = FunctionReturnType<
  typeof internal.mcpProfiles.mcpWhoami
>;
export type McpListProfilesResult = FunctionReturnType<
  typeof internal.mcpProfiles.mcpListProfiles
>;
export type McpSetActiveProfileResult = FunctionReturnType<
  typeof internal.mcpProfiles.mcpSetActiveProfile
>;
export type McpSearchMemoriesResult = FunctionReturnType<
  typeof internal.neo4jActions.mcp.mcpSearchMemories
>;
export type McpRetrieveMemoriesResult = FunctionReturnType<
  typeof internal.neo4jActions.mcp.mcpRetrieveMemories
>;
export type McpCreateMemoryResult = FunctionReturnType<
  typeof internal.neo4jActions.mcp.mcpCreateMemory
>;
export type McpAddFromInstructionResult =
  | StoreFromInstructionResult
  | OpenRouterRequired;
export type McpUpdateMemoryResult = FunctionReturnType<
  typeof internal.neo4jActions.mcp.mcpUpdateMemory
>;
export type McpRelatedMemoriesResult = FunctionReturnType<
  typeof internal.neo4jActions.mcp.mcpGetRelatedMemories
>;
export type McpListSkillsResult = FunctionReturnType<
  typeof internal.mcpSkills.mcpListSkills
>;
export type McpGetSkillResult = FunctionReturnType<
  typeof internal.mcpSkills.mcpGetSkill
>;
export type McpCreateSkillResult = FunctionReturnType<
  typeof internal.mcpSkills.mcpCreateSkill
>;
export type McpUpdateSkillResult = FunctionReturnType<
  typeof internal.mcpSkills.mcpUpdateSkill
>;
export type McpDeleteSkillResult = FunctionReturnType<
  typeof internal.mcpSkills.mcpDeleteSkill
>;
export type McpListWikiResult = FunctionReturnType<
  typeof internal.mcpWiki.mcpListWiki
>;
export type McpGetWikiResult = FunctionReturnType<
  typeof internal.mcpWiki.mcpGetWiki
>;
export type McpSearchWikiResult = FunctionReturnType<
  typeof internal.mcpWiki.mcpSearchWiki
>;
export type McpCreateWikiResult = FunctionReturnType<
  typeof internal.mcpWiki.mcpCreateWiki
>;
export type McpUpdateWikiResult = FunctionReturnType<
  typeof internal.mcpWiki.mcpUpdateWiki
>;
export type McpDeleteWikiResult = FunctionReturnType<
  typeof internal.mcpWiki.mcpDeleteWiki
>;
export type McpListCodebasesResult = FunctionReturnType<
  typeof internal.mcpCodebases.mcpListCodebases
>;
export type McpCodebaseOverviewResult = FunctionReturnType<
  typeof internal.mcpCodebases.mcpGetCodebaseOverview
>;
export type McpCodebaseSearchResult = FunctionReturnType<
  typeof internal.mcpCodebases.mcpSearchCodebaseSymbols
>;
export type McpCodebaseContextResult = FunctionReturnType<
  typeof internal.mcpCodebases.mcpGetCodebaseSymbolContext
>;
export type McpCodebaseImpactResult = FunctionReturnType<
  typeof internal.mcpCodebases.mcpGetCodebaseImpact
>;
export type McpCodebaseGraphResult = FunctionReturnType<
  typeof internal.mcpCodebases.mcpGetCodebaseGraph
>;

export function isOpenRouterRequired(
  value: McpAddFromInstructionResult,
): value is OpenRouterRequired {
  return "error" in value;
}
