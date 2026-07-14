"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  getDownstreamImpact,
  getUpstreamImpact,
  type ImpactNode,
} from "../../engine/neo4j/codebase/impact";
import {
  getGraphOverview,
  getOverviewStats,
  getSymbolContext,
  searchSymbols,
  type OverviewStats,
  type SearchSymbolsResult,
  type SymbolContext,
} from "../../engine/neo4j/codebase/read";
import { runWithNeo4jDriver } from "../neo4jActions/_shared/driver";
import {
  codebaseDirectionValidator,
  codebaseSymbolKindValidator,
} from "../validators";

type GraphResult = Awaited<ReturnType<typeof getGraphOverview>>;
type ImpactResult = { nodes: ImpactNode[] };
type SearchResult = { results: SearchSymbolsResult[] };

// MCP/JSON may deliver floats (e.g
function normalizeOptionalInt(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.trunc(value);
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

export const mcpGetCodebaseOverview = internalAction({
  args: { clerkId: v.string(), codebaseId: v.string() },
  handler: async (ctx, args): Promise<OverviewStats> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    return await runWithNeo4jDriver(
      { clerkId: args.clerkId, codebaseId: ownedId },
      getOverviewStats,
    );
  },
});

export const mcpSearchCodebaseSymbols = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    query: v.string(),
    kind: v.optional(codebaseSymbolKindValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchResult> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    return await runWithNeo4jDriver(
      {
        clerkId: args.clerkId,
        codebaseId: ownedId,
        query: args.query,
        kind: args.kind,
        limit: normalizeOptionalInt(args.limit),
      },
      async (params) => ({ results: await searchSymbols(params) }),
    );
  },
});

export const mcpGetCodebaseSymbolContext = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    symbolId: v.string(),
  },
  handler: async (ctx, args): Promise<SymbolContext | null> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    return await runWithNeo4jDriver(
      {
        clerkId: args.clerkId,
        codebaseId: ownedId,
        symbolId: args.symbolId,
      },
      getSymbolContext,
    );
  },
});

export const mcpGetCodebaseImpact = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    symbolId: v.string(),
    direction: codebaseDirectionValidator,
    depth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ImpactResult> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    const depth = normalizeOptionalInt(args.depth);
    return await runWithNeo4jDriver(
      {
        clerkId: args.clerkId,
        codebaseId: ownedId,
        symbolId: args.symbolId,
        direction: args.direction,
        depth,
      },
      async ({ driver, userId, codebaseId, symbolId, direction }) => {
        const nodes =
          direction === "upstream"
            ? await getUpstreamImpact({
                driver,
                userId,
                codebaseId,
                symbolId,
                depth,
              })
            : await getDownstreamImpact({
                driver,
                userId,
                codebaseId,
                symbolId,
                depth,
              });
        return { nodes };
      },
    );
  },
});

export const mcpGetCodebaseGraph = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    kinds: v.optional(v.array(codebaseSymbolKindValidator)),
    processId: v.optional(v.string()),
    blastRadiusOf: v.optional(v.string()),
    blastDirection: v.optional(codebaseDirectionValidator),
    blastDepth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<GraphResult> => {
    const ownedId = await requireOwnedCodebaseId(
      ctx,
      args.clerkId,
      args.codebaseId,
    );
    return await runWithNeo4jDriver(
      {
        clerkId: args.clerkId,
        codebaseId: ownedId,
        kinds: args.kinds,
        processId: args.processId,
        blastRadiusOf: args.blastRadiusOf,
        blastDirection: args.blastDirection,
        blastDepth: normalizeOptionalInt(args.blastDepth),
      },
      getGraphOverview,
    );
  },
});
