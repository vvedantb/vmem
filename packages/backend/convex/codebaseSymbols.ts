/**
 * Public AI- and web-facing surface for the Phase 1 codebase parser.
 *
 * Each function delegates to an `internalAction` in
 * `convex/neo4jActions/codebases.ts` because the actual Neo4j calls
 * need the Node runtime (the `neo4j-driver` package depends on Node
 * built-ins). The bridge cost is one `runAction` hop — well worth it
 * for keeping the V8-runtime auth gate centralised.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authAction, requireClerkId } from "./auth";

const kindValidator = v.union(
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

interface OverviewStatsResult {
  fileCount: number;
  functionCount: number;
  classCount: number;
  interfaceCount: number;
  processCount: number;
  callEdgeCount: number;
  importEdgeCount: number;
}

/** Lightweight stats block — drives the header `<files>/<fns>/<classes>/<processes>` line. */
export const getOverview = authAction({
  args: { codebaseId: v.string() },
  handler: async (ctx, args): Promise<OverviewStatsResult> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.codebases.getOverviewStatsInternal,
      { clerkId, codebaseId: args.codebaseId },
    );
  },
});

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
  /** True when the payload was capped to fit within Convex's 8192 array
   *  limit. The canvas surfaces this so the user knows to filter down. */
  truncated: boolean;
}

/** Filtered graph payload — kinds, processId, blastRadius all optional. */
export const getGraph = authAction({
  args: {
    codebaseId: v.string(),
    kinds: v.optional(v.array(kindValidator)),
    processId: v.optional(v.string()),
    blastRadiusOf: v.optional(v.string()),
    blastDirection: v.optional(directionValidator),
    blastDepth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<GraphResult> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.codebases.getGraphInternal,
      {
        clerkId,
        codebaseId: args.codebaseId,
        kinds: args.kinds,
        processId: args.processId,
        blastRadiusOf: args.blastRadiusOf,
        blastDirection: args.blastDirection,
        blastDepth: args.blastDepth,
      },
    );
  },
});

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

/** Detail-panel payload — metadata + neighbours + processes. */
export const getContext = authAction({
  args: { codebaseId: v.string(), symbolId: v.string() },
  handler: async (ctx, args): Promise<SymbolContextResult | null> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.codebases.getSymbolContextInternal,
      {
        clerkId,
        codebaseId: args.codebaseId,
        symbolId: args.symbolId,
      },
    );
  },
});

interface ImpactResult {
  nodes: { id: string; distance: number }[];
}

/** Blast-radius — upstream callers or downstream callees within depth. */
export const getImpact = authAction({
  args: {
    codebaseId: v.string(),
    symbolId: v.string(),
    direction: directionValidator,
    depth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ImpactResult> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.codebases.getImpactInternal,
      {
        clerkId,
        codebaseId: args.codebaseId,
        symbolId: args.symbolId,
        direction: args.direction,
        depth: args.depth,
      },
    );
  },
});

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

/** Symbol search via fulltext index w/ substring fallback. */
export const searchSymbols = authAction({
  args: {
    codebaseId: v.string(),
    query: v.string(),
    kind: v.optional(kindValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchResult> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.codebases.searchSymbolsInternal,
      {
        clerkId,
        codebaseId: args.codebaseId,
        query: args.query,
        kind: args.kind,
        limit: args.limit,
      },
    );
  },
});
