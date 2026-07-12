"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

type CodebaseStatus = Doc<"codebases">["status"];

interface McpCodebaseSummary {
  id: string;
  repoFullName: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  status: CodebaseStatus;
  language?: string;
  description?: string;
  isPrivate?: boolean;
  totalFiles: number;
  syncedFiles: number;
  lastSyncedAt?: number;
  functionCount?: number;
  classCount?: number;
  interfaceCount?: number;
  callEdgeCount?: number;
  processCount?: number;
  parserVersion?: string;
  lastParseError?: string;
  errorMessage?: string;
}

interface OverviewStatsResult {
  fileCount: number;
  functionCount: number;
  classCount: number;
  interfaceCount: number;
  processCount: number;
  callEdgeCount: number;
  importEdgeCount: number;
}

interface GraphResult {
  nodes: Array<{
    id: string;
    kind:
      | "code-file"
      | "code-function"
      | "code-class"
      | "code-interface"
      | "code-process";
    name: string;
    path: string;
    directory: string;
    isExported?: boolean;
    isAsync?: boolean;
    isTest?: boolean;
  }>;
  edges: Array<{
    fromId: string;
    toId: string;
    type:
      | "imports"
      | "calls"
      | "contains"
      | "has_method"
      | "extends"
      | "implements"
      | "starts_process"
      | "includes";
    confidence?: number;
    tier?: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
  }>;
  truncated: boolean;
}

interface SymbolContextResult {
  id: string;
  kind:
    | "code-file"
    | "code-function"
    | "code-class"
    | "code-interface"
    | "code-process";
  name: string;
  qualifiedName: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  isExported?: boolean;
  isAsync?: boolean;
  isTest?: boolean;
  callsIn: { id: string; name: string; filePath: string }[];
  callsOut: { id: string; name: string; filePath: string }[];
  processes: { id: string; name: string }[];
}

interface ImpactResult {
  nodes: { id: string; distance: number }[];
}

interface SearchResult {
  results: Array<{
    id: string;
    kind:
      | "code-file"
      | "code-function"
      | "code-class"
      | "code-interface"
      | "code-process";
    name: string;
    qualifiedName: string;
    filePath: string;
  }>;
}

/** MCP/JSON may deliver floats (e.g. 25.0); normalize before Neo4j hops. */
function normalizeOptionalInt(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.trunc(value);
}

const symbolKindValidator = v.union(
  v.literal("code-file"),
  v.literal("code-function"),
  v.literal("code-class"),
  v.literal("code-interface"),
  v.literal("code-process"),
);

const directionValidator = v.union(
  v.literal("upstream"),
  v.literal("downstream"),
);

function mapCodebaseSummary(row: Doc<"codebases">): McpCodebaseSummary {
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

async function requireOwnedCodebaseId(
  ctx: ActionCtx,
  clerkId: string,
  codebaseId: string,
): Promise<Id<"codebases">> {
  const user = await ctx.runQuery(internal.users.getByClerkIdInternal, {
    clerkId,
  });
  if (!user) {
    throw new Error("User not found");
  }

  const normalizedId = await ctx.runQuery(
    internal.codebases.normalizeCodebaseId,
    { id: codebaseId },
  );
  if (!normalizedId) {
    throw new Error("Invalid codebase id");
  }

  const codebase = await ctx.runQuery(internal.codebases.getByIdInternal, {
    id: normalizedId,
    userId: user._id,
  });
  if (!codebase) {
    throw new Error("Codebase not found");
  }

  return normalizedId;
}

/** MCP entry point: list connected codebases for the authenticated user. */
export const mcpListCodebases = internalAction({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<McpCodebaseSummary[]> => {
    const user = await ctx.runQuery(internal.users.getByClerkIdInternal, {
      clerkId: args.clerkId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    const rows = await ctx.runQuery(internal.codebases.listMyInternal, {
      userId: user._id,
    });
    return rows.map(mapCodebaseSummary);
  },
});

/** MCP entry point: aggregate graph stats for a synced codebase. */
export const mcpGetCodebaseOverview = internalAction({
  args: { clerkId: v.string(), codebaseId: v.string() },
  handler: async (ctx, args): Promise<OverviewStatsResult> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    return await ctx.runAction(
      internal.neo4jActions.codebases.getOverviewStatsInternal,
      { clerkId: args.clerkId, codebaseId: ownedId },
    );
  },
});

/** MCP entry point: search symbols in a codebase graph. */
export const mcpSearchCodebaseSymbols = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    query: v.string(),
    kind: v.optional(symbolKindValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchResult> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    return await ctx.runAction(
      internal.neo4jActions.codebases.searchSymbolsInternal,
      {
        clerkId: args.clerkId,
        codebaseId: ownedId,
        query: args.query,
        kind: args.kind,
        limit: normalizeOptionalInt(args.limit),
      },
    );
  },
});

/** MCP entry point: symbol detail with calls in/out and processes. */
export const mcpGetCodebaseSymbolContext = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    symbolId: v.string(),
  },
  handler: async (ctx, args): Promise<SymbolContextResult | null> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    return await ctx.runAction(
      internal.neo4jActions.codebases.getSymbolContextInternal,
      {
        clerkId: args.clerkId,
        codebaseId: ownedId,
        symbolId: args.symbolId,
      },
    );
  },
});

/** MCP entry point: upstream/downstream blast radius on CALLS edges. */
export const mcpGetCodebaseImpact = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    symbolId: v.string(),
    direction: directionValidator,
    depth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ImpactResult> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    return await ctx.runAction(
      internal.neo4jActions.codebases.getImpactInternal,
      {
        clerkId: args.clerkId,
        codebaseId: ownedId,
        symbolId: args.symbolId,
        direction: args.direction,
        depth: normalizeOptionalInt(args.depth),
      },
    );
  },
});

/** MCP entry point: filtered graph payload (nodes + relationship edges). */
export const mcpGetCodebaseGraph = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    kinds: v.optional(v.array(symbolKindValidator)),
    processId: v.optional(v.string()),
    blastRadiusOf: v.optional(v.string()),
    blastDirection: v.optional(directionValidator),
    blastDepth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<GraphResult> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    return await ctx.runAction(
      internal.neo4jActions.codebases.getGraphInternal,
      {
        clerkId: args.clerkId,
        codebaseId: ownedId,
        kinds: args.kinds,
        processId: args.processId,
        blastRadiusOf: args.blastRadiusOf,
        blastDirection: args.blastDirection,
        blastDepth: normalizeOptionalInt(args.blastDepth),
      },
    );
  },
});
