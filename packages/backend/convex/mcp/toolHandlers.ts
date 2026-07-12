import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { toSkillIndexEntry } from "../skills";
import type { McpScope } from "../profiles/mcpAccess";
import type { z } from "zod";
import {
  codebaseContextSchema,
  codebaseGraphSchema,
  codebaseImpactSchema,
  codebaseOverviewSchema,
  codebaseSearchSchema,
  filesDeleteSchema,
  filesGetSchema,
  filesListSchema,
  filesUploadSchema,
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

export type ToolHandlerResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export interface ToolHandlerContext {
  ctx: ActionCtx;
  clerkUserId: string;
  scope: McpScope;
  /**
   * Pin memory tools to one profile (cloud chat passes the thread's
   * workspace). Tool-call `profileId` params still win when the model
   * passes one explicitly; MCP connectors leave this unset and fall back
   * to the scope's default profile.
   */
  fixedProfileId?: string;
}

export function formatToolResult(result: ToolHandlerResult): string {
  if (!result.ok) {
    return JSON.stringify({ error: result.error }, null, 2);
  }
  return JSON.stringify(result.data, null, 2);
}

async function safe(
  label: string,
  fn: () => Promise<unknown>,
): Promise<ToolHandlerResult> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[MCP][${label}]`, message);
    return { ok: false, error: message };
  }
}

function scopedClerk(ctx: ToolHandlerContext) {
  return { clerkId: ctx.clerkUserId, scope: ctx.scope };
}

function scopedMemory(ctx: ToolHandlerContext) {
  return { clerkId: ctx.clerkUserId, mcpScope: ctx.scope };
}

export async function runPing(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
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
): Promise<ToolHandlerResult> {
  return safe("whoami", () =>
    ctx.ctx.runAction(internal.mcp.profiles.mcpWhoami, scopedClerk(ctx)),
  );
}

export async function runContextPromptGet(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  if (ctx.scope === "team") {
    return {
      ok: false,
      error:
        "context_prompt is only available on the personal vmem MCP connector",
    };
  }
  return safe("context_prompt_get", () =>
    ctx.ctx.runAction(internal.contextPromptApi.mcpGetContextPrompt, {
      clerkId: ctx.clerkUserId,
    }),
  );
}

export async function runListProfiles(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  return safe("list_profiles", () =>
    ctx.ctx.runAction(internal.mcp.profiles.mcpListProfiles, scopedClerk(ctx)),
  );
}

export async function runSetActiveProfile(
  ctx: ToolHandlerContext,
  params: z.infer<typeof setActiveProfileSchema>,
): Promise<ToolHandlerResult> {
  return safe("set_active_profile", () =>
    ctx.ctx.runAction(internal.mcp.profiles.mcpSetActiveProfile, {
      ...scopedClerk(ctx),
      profileId: params.profileId,
    }),
  );
}

export async function runMemorySearch(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memorySearchSchema>,
): Promise<ToolHandlerResult> {
  return safe("memory_search", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpSearchMemories, {
      ...scopedMemory(ctx),
      query: params.query,
      type: params.type,
      tags: params.tags,
      limit: params.limit,
      offset: params.offset,
      profileId: params.profileId ?? ctx.fixedProfileId,
    }),
  );
}

export async function runMemoryRetrieve(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memoryRetrieveSchema>,
): Promise<ToolHandlerResult> {
  return safe("memory_retrieve", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpRetrieveMemories, {
      ...scopedMemory(ctx),
      query: params.query,
      limit: params.limit,
      profileId: params.profileId ?? ctx.fixedProfileId,
    }),
  );
}

export async function runMemoryAdd(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memoryAddSchema>,
): Promise<ToolHandlerResult> {
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
): Promise<ToolHandlerResult> {
  const result = await safe("memory_add_instruction", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpAddFromInstruction, {
      ...scopedMemory(ctx),
      instruction: params.instruction,
      profileId: params.profileId,
    }),
  );
  if (!result.ok) return result;

  if (
    typeof result.data === "object" &&
    result.data !== null &&
    "error" in result.data &&
    result.data.error === "openrouter_required"
  ) {
    return {
      ok: false,
      error:
        "OpenRouter is required for instruction-based extraction. Add OPENROUTER_API_KEY in vmem settings.",
    };
  }

  return result;
}

export async function runMemoryUpdate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof memoryUpdateSchema>,
): Promise<ToolHandlerResult> {
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
): Promise<ToolHandlerResult> {
  const result = await safe("memory_delete", () =>
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
): Promise<ToolHandlerResult> {
  return safe("memory_related", () =>
    ctx.ctx.runAction(internal.neo4jActions.mcp.mcpGetRelatedMemories, {
      clerkId: ctx.clerkUserId,
      memoryId: params.memoryId,
    }),
  );
}

export async function runSkillsList(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  return safe("skills_list", async () => {
    const rows = await ctx.ctx.runQuery(
      internal.skills.listEffectiveByClerkIdInternal,
      { clerkId: ctx.clerkUserId },
    );
    return rows.map(toSkillIndexEntry);
  });
}

export async function runSkillsGet(
  ctx: ToolHandlerContext,
  params: z.infer<typeof skillsGetSchema>,
): Promise<ToolHandlerResult> {
  return safe("skills_get", () =>
    ctx.ctx.runQuery(internal.skills.getEffectiveByNameInternal, {
      clerkId: ctx.clerkUserId,
      name: params.name,
    }),
  );
}

export async function runSkillsCreate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof skillsCreateSchema>,
): Promise<ToolHandlerResult> {
  return safe("skills_create", () =>
    ctx.ctx.runMutation(internal.skills.createByClerkIdInternal, {
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
): Promise<ToolHandlerResult> {
  return safe("skills_update", () =>
    ctx.ctx.runMutation(internal.skills.updateByClerkIdInternal, {
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
): Promise<ToolHandlerResult> {
  return safe("skills_delete", async () => {
    await ctx.ctx.runMutation(internal.skills.deleteByClerkIdInternal, {
      clerkId: ctx.clerkUserId,
      name: params.name,
    });
    return { deleted: true };
  });
}

export async function runWikiList(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  return safe("wiki_list", () =>
    ctx.ctx.runAction(internal.mcp.wiki.mcpListWiki, {
      clerkId: ctx.clerkUserId,
    }),
  );
}

export async function runWikiGet(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiGetSchema>,
): Promise<ToolHandlerResult> {
  const result = await safe("wiki_get", () =>
    ctx.ctx.runAction(internal.mcp.wiki.mcpGetWiki, {
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
): Promise<ToolHandlerResult> {
  return safe("wiki_search", () =>
    ctx.ctx.runAction(internal.mcp.wiki.mcpSearchWiki, {
      clerkId: ctx.clerkUserId,
      query: params.query,
    }),
  );
}

export async function runWikiCreate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiCreateSchema>,
): Promise<ToolHandlerResult> {
  return safe("wiki_create", () =>
    ctx.ctx.runAction(internal.mcp.wiki.mcpCreateWiki, {
      clerkId: ctx.clerkUserId,
      kind: params.kind,
      title: params.title,
      parentId: params.parentId,
      parentPath: params.parentPath,
      contentMarkdown: params.contentMarkdown,
      sourceCodebaseId: params.sourceCodebaseId,
    }),
  );
}

export async function runWikiUpdate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiUpdateSchema>,
): Promise<ToolHandlerResult> {
  return safe("wiki_update", () =>
    ctx.ctx.runAction(internal.mcp.wiki.mcpUpdateWiki, {
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
): Promise<ToolHandlerResult> {
  return safe("wiki_delete", () =>
    ctx.ctx.runAction(internal.mcp.wiki.mcpDeleteWiki, {
      clerkId: ctx.clerkUserId,
      id: params.id,
    }),
  );
}

export async function runFilesList(
  ctx: ToolHandlerContext,
  params: z.infer<typeof filesListSchema>,
): Promise<ToolHandlerResult> {
  return safe("files_list", () =>
    ctx.ctx.runAction(internal.mcp.files.mcpListFiles, {
      clerkId: ctx.clerkUserId,
      path: params.path,
    }),
  );
}

export async function runFilesGet(
  ctx: ToolHandlerContext,
  params: z.infer<typeof filesGetSchema>,
): Promise<ToolHandlerResult> {
  return safe("files_get", () =>
    ctx.ctx.runAction(internal.mcp.files.mcpGetFile, {
      clerkId: ctx.clerkUserId,
      path: params.path,
    }),
  );
}

export async function runFilesUpload(
  ctx: ToolHandlerContext,
  params: z.infer<typeof filesUploadSchema>,
): Promise<ToolHandlerResult> {
  return safe("files_upload", () =>
    ctx.ctx.runAction(internal.mcp.files.mcpUploadFile, {
      clerkId: ctx.clerkUserId,
      path: params.path,
      contentBase64: params.contentBase64,
      sourceUrl: params.sourceUrl,
      mimeType: params.mimeType,
    }),
  );
}

export async function runFilesDelete(
  ctx: ToolHandlerContext,
  params: z.infer<typeof filesDeleteSchema>,
): Promise<ToolHandlerResult> {
  return safe("files_delete", () =>
    ctx.ctx.runAction(internal.mcp.files.mcpDeleteFile, {
      clerkId: ctx.clerkUserId,
      path: params.path,
    }),
  );
}

export async function runCodebasesList(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  return safe("codebases_list", () =>
    ctx.ctx.runAction(internal.mcp.codebases.mcpListCodebases, {
      clerkId: ctx.clerkUserId,
    }),
  );
}

export async function runCodebaseOverview(
  ctx: ToolHandlerContext,
  params: z.infer<typeof codebaseOverviewSchema>,
): Promise<ToolHandlerResult> {
  return safe("codebase_overview", () =>
    ctx.ctx.runAction(internal.mcp.codebases.mcpGetCodebaseOverview, {
      clerkId: ctx.clerkUserId,
      codebaseId: params.codebaseId,
    }),
  );
}

export async function runCodebaseSearch(
  ctx: ToolHandlerContext,
  params: z.infer<typeof codebaseSearchSchema>,
): Promise<ToolHandlerResult> {
  return safe("codebase_search", () =>
    ctx.ctx.runAction(internal.mcp.codebases.mcpSearchCodebaseSymbols, {
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
): Promise<ToolHandlerResult> {
  return safe("codebase_context", () =>
    ctx.ctx.runAction(internal.mcp.codebases.mcpGetCodebaseSymbolContext, {
      clerkId: ctx.clerkUserId,
      codebaseId: params.codebaseId,
      symbolId: params.symbolId,
    }),
  );
}

export async function runCodebaseImpact(
  ctx: ToolHandlerContext,
  params: z.infer<typeof codebaseImpactSchema>,
): Promise<ToolHandlerResult> {
  return safe("codebase_impact", () =>
    ctx.ctx.runAction(internal.mcp.codebases.mcpGetCodebaseImpact, {
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
): Promise<ToolHandlerResult> {
  return safe("codebase_graph", () =>
    ctx.ctx.runAction(internal.mcp.codebases.mcpGetCodebaseGraph, {
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
