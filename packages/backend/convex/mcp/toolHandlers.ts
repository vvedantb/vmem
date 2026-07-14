import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { toSkillIndexEntry } from "../skills";
import type { McpScope } from "../profiles/mcpAccess";
import type { z } from "zod";
import { isOpenRouterRequired } from "../http/v1Memories/types";
import { deleteFile, getFile, listFiles, uploadFile } from "./fileOps";
import {
  mapActiveProfile,
  mapProfileListItem,
  mapWhoamiProfileListItem,
} from "./profileMappers";
import type {
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
import {
  createWiki,
  toWikiGetResult,
  toWikiListItem,
  toWikiSearchItem,
  updateWiki,
} from "./wikiOps";

export type ToolHandlerResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export interface ToolHandlerContext {
  ctx: ActionCtx;
  clerkUserId: string;
  scope: McpScope;
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
  return safe("whoami", async () => {
    const profiles = await ctx.ctx.runQuery(
      internal.profiles.listByClerkIdAndScopeInternal,
      scopedClerk(ctx),
    );

    let activeProfile: Doc<"profiles"> | null = await ctx.ctx.runQuery(
      internal.profiles.getActiveProfileForMcpScopeInternal,
      scopedClerk(ctx),
    );

    if (!activeProfile && ctx.scope === "personal") {
      activeProfile = await ctx.ctx.runMutation(
        internal.profiles.getOrCreateDefaultByClerkIdInternal,
        { clerkId: ctx.clerkUserId },
      );
    }

    return {
      authenticated: true,
      clerkUserId: ctx.clerkUserId,
      scope: ctx.scope,
      activeProfile: activeProfile ? mapActiveProfile(activeProfile) : null,
      profiles: profiles.map(mapWhoamiProfileListItem),
    };
  });
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
  return safe("list_profiles", async () => {
    const profiles = await ctx.ctx.runQuery(
      internal.profiles.listByClerkIdAndScopeInternal,
      scopedClerk(ctx),
    );
    return profiles.map(mapProfileListItem);
  });
}

export async function runSetActiveProfile(
  ctx: ToolHandlerContext,
  params: z.infer<typeof setActiveProfileSchema>,
): Promise<ToolHandlerResult> {
  return safe("set_active_profile", async () => {
    await ctx.ctx.runMutation(
      internal.userSettings.setMcpDefaultProfileByClerkIdInternal,
      {
        ...scopedClerk(ctx),
        profileId: params.profileId,
      },
    );

    const activeProfile: Doc<"profiles"> | null = await ctx.ctx.runQuery(
      internal.profiles.getActiveProfileForMcpScopeInternal,
      scopedClerk(ctx),
    );
    if (!activeProfile) {
      throw new Error("Failed to resolve active profile");
    }

    return mapActiveProfile(activeProfile);
  });
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
      profileId: params.profileId,
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
      profileId: params.profileId,
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

  if (isOpenRouterRequired(result.data)) {
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
      ...scopedMemory(ctx),
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
      ...scopedMemory(ctx),
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
      ...scopedMemory(ctx),
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
  return safe("wiki_list", async () => {
    const rows = await ctx.ctx.runQuery(internal.wiki.listByClerkIdInternal, {
      clerkId: ctx.clerkUserId,
    });
    return rows.map(toWikiListItem);
  });
}

export async function runWikiGet(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiGetSchema>,
): Promise<ToolHandlerResult> {
  const result = await safe("wiki_get", async () => {
    const node = await ctx.ctx.runQuery(internal.wiki.getByIdInternal, {
      clerkId: ctx.clerkUserId,
      id: params.id,
    });
    if (!node) return null;
    return toWikiGetResult(node);
  });
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
  return safe("wiki_search", async () => {
    const rows = await ctx.ctx.runQuery(internal.wiki.searchByClerkIdInternal, {
      clerkId: ctx.clerkUserId,
      queryText: params.query,
    });
    return rows.map(toWikiSearchItem);
  });
}

export async function runWikiCreate(
  ctx: ToolHandlerContext,
  params: z.infer<typeof wikiCreateSchema>,
): Promise<ToolHandlerResult> {
  return safe("wiki_create", () =>
    createWiki(ctx.ctx, {
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
    updateWiki(ctx.ctx, {
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
  return safe("wiki_delete", async () => {
    const deletedCount = await ctx.ctx.runMutation(
      internal.wiki.deleteByClerkIdInternal,
      { clerkId: ctx.clerkUserId, id: params.id },
    );
    return { deletedCount };
  });
}

export async function runFilesList(
  ctx: ToolHandlerContext,
  params: z.infer<typeof filesListSchema>,
): Promise<ToolHandlerResult> {
  return safe("files_list", () =>
    listFiles(ctx.ctx, ctx.clerkUserId, params.path),
  );
}

export async function runFilesGet(
  ctx: ToolHandlerContext,
  params: z.infer<typeof filesGetSchema>,
): Promise<ToolHandlerResult> {
  return safe("files_get", () =>
    getFile(ctx.ctx, ctx.clerkUserId, params.path),
  );
}

export async function runFilesUpload(
  ctx: ToolHandlerContext,
  params: z.infer<typeof filesUploadSchema>,
): Promise<ToolHandlerResult> {
  return safe("files_upload", () =>
    uploadFile(ctx.ctx, {
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
    deleteFile(ctx.ctx, ctx.clerkUserId, params.path),
  );
}

function mapCodebaseSummary(row: Doc<"codebases">) {
  return {
    id: row._id,
    repoFullName: row.repoFullName,
    repoOwner: row.repoOwner,
    repoName: row.repoName,
    defaultBranch: row.defaultBranch,
    status: row.status,
    language: row.language,
    description: row.description,
    isPrivate: row.isPrivate,
    totalFiles: row.totalFiles,
    syncedFiles: row.syncedFiles,
    lastSyncedAt: row.lastSyncedAt,
    functionCount: row.functionCount,
    classCount: row.classCount,
    interfaceCount: row.interfaceCount,
    callEdgeCount: row.callEdgeCount,
    processCount: row.processCount,
    parserVersion: row.parserVersion,
    lastParseError: row.lastParseError,
    errorMessage: row.errorMessage,
  };
}

export async function runCodebasesList(
  ctx: ToolHandlerContext,
): Promise<ToolHandlerResult> {
  return safe("codebases_list", async () => {
    const user = await ctx.ctx.runQuery(internal.users.getByClerkIdInternal, {
      clerkId: ctx.clerkUserId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    const rows = await ctx.ctx.runQuery(internal.codebases.listMyInternal, {
      userId: user._id,
    });
    return rows.map(mapCodebaseSummary);
  });
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
