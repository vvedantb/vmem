import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { McpScope } from "../profiles/mcpAccess";
import type { z } from "zod";
import {
  codebaseContextSchema,
  codebaseGraphSchema,
  codebaseImpactSchema,
  codebaseOverviewSchema,
  codebaseSearchSchema,
  memoryAddInstructionSchema,
  memoryAddSchema,
  memoryDeleteSchema,
  memoryRelatedSchema,
  memoryRetrieveSchema,
  memorySearchSchema,
  memoryUpdateSchema,
  setActiveProfileSchema,
  skillsCreateSchema,
  skillsDeleteSchema,
  skillsGetSchema,
  skillsUpdateSchema,
  wikiCreateSchema,
  wikiDeleteSchema,
  wikiGetSchema,
  wikiSearchSchema,
  wikiUpdateSchema,
} from "./schemas";
import {
  formatToolResult,
  isOpenRouterRequired,
  safe,
  type MemoryDeleteToolData,
  type McpAddFromInstructionResult,
  type StoreFromInstructionResult,
  type McpCodebaseContextResult,
  type McpCodebaseGraphResult,
  type McpCodebaseImpactResult,
  type McpCodebaseOverviewResult,
  type McpCodebaseSearchResult,
  type McpCreateMemoryResult,
  type McpCreateSkillResult,
  type McpCreateWikiResult,
  type McpDeleteSkillResult,
  type McpDeleteWikiResult,
  type McpGetSkillResult,
  type McpGetWikiResult,
  type McpListCodebasesResult,
  type McpListProfilesResult,
  type McpListSkillsResult,
  type McpListWikiResult,
  type McpRelatedMemoriesResult,
  type McpRetrieveMemoriesResult,
  type McpSearchMemoriesResult,
  type McpSearchWikiResult,
  type McpSetActiveProfileResult,
  type McpUpdateMemoryResult,
  type McpUpdateSkillResult,
  type McpUpdateWikiResult,
  type McpWhoamiResult,
  type PingToolData,
  type ToolHandlerResult,
} from "./toolResults";

export type { ToolHandlerResult } from "./toolResults";
export { formatToolResult } from "./toolResults";

export interface ToolHandlerContext {
  ctx: ActionCtx;
  clerkUserId: string;
  scope: McpScope;
}

function scopedClerk(ctx: ToolHandlerContext) {
  return { clerkId: ctx.clerkUserId, scope: ctx.scope };
}

function scopedMemory(ctx: ToolHandlerContext) {
  return { clerkId: ctx.clerkUserId, mcpScope: ctx.scope };
}

export async function runPing(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult<PingToolData>> {
  return {
    ok: true,
    data: {
      ok: true,
      scope: ctx.scope,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function runWhoami(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult<McpWhoamiResult>> {
  return safe("whoami", () =>
    ctx.ctx.runAction(internal.mcpProfiles.mcpWhoami, scopedClerk(ctx)),
  );
}

export async function runListProfiles(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult<McpListProfilesResult>> {
  return safe("list_profiles", () =>
    ctx.ctx.runAction(internal.mcpProfiles.mcpListProfiles, scopedClerk(ctx)),
  );
}

export async function runSetActiveProfile(
  ctx: ToolHandlerContext,
  params: z.infer<typeof setActiveProfileSchema>,
): Promise<ToolHandlerResult<McpSetActiveProfileResult>> {
  return safe("set_active_profile", () =>
    ctx.ctx.runAction(internal.mcpProfiles.mcpSetActiveProfile, {
      ...scopedClerk(ctx),
      profileId: params.profileId,
    }),
  );
}

export async function runMemorySearch(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memorySearchSchema>,
): Promise<ToolHandlerResult<McpSearchMemoriesResult>> {
  return safe("memory_search", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpSearchMemories, {
      ...scopedMemory(ctx),
      query: params.query,
      type: params.type,
      tags: params.tags,
      limit: params.limit,
      offset: params.offset,
      profileId: params.profileId,
    }),
  );
}

export async function runMemoryRetrieve(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memoryRetrieveSchema>,
): Promise<ToolHandlerResult<McpRetrieveMemoriesResult>> {
  return safe("memory_retrieve", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpRetrieveMemories, {
      ...scopedMemory(ctx),
      query: params.query,
      limit: params.limit,
      profileId: params.profileId,
    }),
  );
}

export async function runMemoryAdd(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memoryAddSchema>,
): Promise<ToolHandlerResult<McpCreateMemoryResult>> {
  return safe("memory_add", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpCreateMemory, {
      ...scopedMemory(ctx),
      title: params.title,
      content: params.content,
      type: params.type,
      source: params.source,
      tags: params.tags,
      confidence: params.confidence,
      profileId: params.profileId,
    }),
  );
}

export async function runMemoryAddInstruction(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memoryAddInstructionSchema>,
): Promise<ToolHandlerResult<StoreFromInstructionResult>> {
  const result = await safe<McpAddFromInstructionResult>(
    "memory_add_instruction",
    () =>
      ctx.ctx.runAction(internal.neo4jActions.mcp.mcpAddFromInstruction, {
        ...scopedMemory(ctx),
        instruction: params.instruction,
        profileId: params.profileId,
      }),
  );
  if (!result.ok) return result;

  if (isOpenRouterRequired(result.data)) {
    return {
      ok: false,
      error:
        "OpenRouter is required for instruction-based extraction. Add OPENROUTER_API_KEY in vmem settings.",
    };
  }

  return { ok: true, data: result.data };
}

export async function runMemoryUpdate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memoryUpdateSchema>,
): Promise<ToolHandlerResult<McpUpdateMemoryResult>> {
  return safe("memory_update", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpUpdateMemory, {
      clerkId: ctx.clerkUserId,
      memoryId: params.id,
      title: params.title,
      content: params.content,
      type: params.type,
      status: params.status,
      tags: params.tags,
      confidence: params.confidence,
    }),
  );
}

export async function runMemoryDelete(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memoryDeleteSchema>,
): Promise<ToolHandlerResult<MemoryDeleteToolData>> {
  const result = await safe<boolean>("memory_delete", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpDeleteMemory, {
      clerkId: ctx.clerkUserId,
      memoryId: params.id,
    }),
  );
  if (!result.ok) return result;
  return { ok: true, data: { deleted: result.data } };
}

export async function runMemoryRelated(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memoryRelatedSchema>,
): Promise<ToolHandlerResult<McpRelatedMemoriesResult>> {
  return safe("memory_related", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpGetRelatedMemories, {
      clerkId: ctx.clerkUserId,
      memoryId: params.memoryId,
    }),
  );
}

export async function runSkillsList(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult<McpListSkillsResult>> {
  return safe("skills_list", () =>
    ctx.ctx.runAction(internal.mcpSkills.mcpListSkills, {
      clerkId: ctx.clerkUserId,
    }),
  );
}

export async function runSkillsGet(
  ctx: ToolHandlerContext,
  params: z.infer<typeof skillsGetSchema>,
): Promise<ToolHandlerResult<McpGetSkillResult>> {
  return safe("skills_get", () =>
    ctx.ctx.runAction(internal.mcpSkills.mcpGetSkill, {
      clerkId: ctx.clerkUserId,
      name: params.name,
    }),
  );
}

export async function runSkillsCreate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof skillsCreateSchema>,
): Promise<ToolHandlerResult<McpCreateSkillResult>> {
  return safe("skills_create", () =>
    ctx.ctx.runAction(internal.mcpSkills.mcpCreateSkill, {
      clerkId: ctx.clerkUserId,
      name: params.name,
      description: params.description,
      instructions: params.instructions,
    }),
  );
}

export async function runSkillsUpdate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof skillsUpdateSchema>,
): Promise<ToolHandlerResult<McpUpdateSkillResult>> {
  return safe("skills_update", () =>
    ctx.ctx.runAction(internal.mcpSkills.mcpUpdateSkill, {
      clerkId: ctx.clerkUserId,
      name: params.name,
      newName: params.newName,
      description: params.description,
      instructions: params.instructions,
      enabled: params.enabled,
    }),
  );
}

export async function runSkillsDelete(
  ctx: ToolHandlerContext,
  params: z.infer<typeof skillsDeleteSchema>,
): Promise<ToolHandlerResult<McpDeleteSkillResult>> {
  return safe("skills_delete", () =>
    ctx.ctx.runAction(internal.mcpSkills.mcpDeleteSkill, {
      clerkId: ctx.clerkUserId,
      name: params.name,
    }),
  );
}

export async function runWikiList(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult<McpListWikiResult>> {
  return safe("wiki_list", () =>
    ctx.ctx.runAction(internal.mcpWiki.mcpListWiki, {
      clerkId: ctx.clerkUserId,
    }),
  );
}

export async function runWikiGet(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiGetSchema>,
): Promise<ToolHandlerResult<McpGetWikiResult>> {
  const result = await safe("wiki_get", () =>
    ctx.ctx.runAction(internal.mcpWiki.mcpGetWiki, {
      clerkId: ctx.clerkUserId,
      id: params.id,
    }),
  );
  if (!result.ok) return result;
  if (result.data === null) {
    return { ok: false, error: "Wiki node not found" };
  }
  return result;
}

export async function runWikiSearch(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiSearchSchema>,
): Promise<ToolHandlerResult<McpSearchWikiResult>> {
  return safe("wiki_search", () =>
    ctx.ctx.runAction(internal.mcpWiki.mcpSearchWiki, {
      clerkId: ctx.clerkUserId,
      query: params.query,
    }),
  );
}

export async function runWikiCreate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiCreateSchema>,
): Promise<ToolHandlerResult<McpCreateWikiResult>> {
  return safe("wiki_create", () =>
    ctx.ctx.runAction(internal.mcpWiki.mcpCreateWiki, {
      clerkId: ctx.clerkUserId,
      kind: params.kind,
      title: params.title,
      parentId: params.parentId,
      contentMarkdown: params.contentMarkdown,
    }),
  );
}

export async function runWikiUpdate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiUpdateSchema>,
): Promise<ToolHandlerResult<McpUpdateWikiResult>> {
  return safe("wiki_update", () =>
    ctx.ctx.runAction(internal.mcpWiki.mcpUpdateWiki, {
      clerkId: ctx.clerkUserId,
      id: params.id,
      title: params.title,
      contentMarkdown: params.contentMarkdown,
      contentMode: params.contentMode,
    }),
  );
}

export async function runWikiDelete(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiDeleteSchema>,
): Promise<ToolHandlerResult<McpDeleteWikiResult>> {
  return safe("wiki_delete", () =>
    ctx.ctx.runAction(internal.mcpWiki.mcpDeleteWiki, {
      clerkId: ctx.clerkUserId,
      id: params.id,
    }),
  );
}

export async function runCodebasesList(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult<McpListCodebasesResult>> {
  return safe("codebases_list", () =>
    ctx.ctx.runAction(internal.mcpCodebases.mcpListCodebases, {
      clerkId: ctx.clerkUserId,
    }),
  );
}

export async function runCodebaseOverview(
  ctx: ToolHandlerContext,
  params: z.infer<typeof codebaseOverviewSchema>,
): Promise<ToolHandlerResult<McpCodebaseOverviewResult>> {
  return safe("codebase_overview", () =>
    ctx.ctx.runAction(internal.mcpCodebases.mcpGetCodebaseOverview, {
      clerkId: ctx.clerkUserId,
      codebaseId: params.codebaseId,
    }),
  );
}

export async function runCodebaseSearch(
  ctx: ToolHandlerContext,
  params: z.infer<typeof codebaseSearchSchema>,
): Promise<ToolHandlerResult<McpCodebaseSearchResult>> {
  return safe("codebase_search", () =>
    ctx.ctx.runAction(internal.mcpCodebases.mcpSearchCodebaseSymbols, {
      clerkId: ctx.clerkUserId,
      codebaseId: params.codebaseId,
      query: params.query,
      kind: params.kind,
      limit: params.limit,
    }),
  );
}

export async function runCodebaseContext(
  ctx: ToolHandlerContext,
  params: z.infer<typeof codebaseContextSchema>,
): Promise<ToolHandlerResult<McpCodebaseContextResult>> {
  return safe("codebase_context", () =>
    ctx.ctx.runAction(internal.mcpCodebases.mcpGetCodebaseSymbolContext, {
      clerkId: ctx.clerkUserId,
      codebaseId: params.codebaseId,
      symbolId: params.symbolId,
    }),
  );
}

export async function runCodebaseImpact(
  ctx: ToolHandlerContext,
  params: z.infer<typeof codebaseImpactSchema>,
): Promise<ToolHandlerResult<McpCodebaseImpactResult>> {
  return safe("codebase_impact", () =>
    ctx.ctx.runAction(internal.mcpCodebases.mcpGetCodebaseImpact, {
      clerkId: ctx.clerkUserId,
      codebaseId: params.codebaseId,
      symbolId: params.symbolId,
      direction: params.direction,
      depth: params.depth,
    }),
  );
}

export async function runCodebaseGraph(
  ctx: ToolHandlerContext,
  params: z.infer<typeof codebaseGraphSchema>,
): Promise<ToolHandlerResult<McpCodebaseGraphResult>> {
  return safe("codebase_graph", () =>
    ctx.ctx.runAction(internal.mcpCodebases.mcpGetCodebaseGraph, {
      clerkId: ctx.clerkUserId,
      codebaseId: params.codebaseId,
      kinds: params.kinds,
      processId: params.processId,
      blastRadiusOf: params.blastRadiusOf,
      blastDirection: params.blastDirection,
      blastDepth: params.blastDepth,
    }),
  );
}
