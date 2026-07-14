"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authAction } from "./auth";
import {
  getGraphOverview,
  getSymbolContext,
  type SymbolContext,
} from "../engine/neo4j/codebase/read";
import { runWithNeo4jDriver } from "./neo4jActions/_shared/driver";
import {
  codebaseDirectionValidator,
  codebaseSymbolKindValidator,
} from "./validators";

type GraphResult = Awaited<ReturnType<typeof getGraphOverview>>;

// filtered graph payload — kinds, processId, blastRadius all optional
export const getGraph = authAction({
  args: {
    codebaseId: v.string(),
    kinds: v.optional(v.array(codebaseSymbolKindValidator)),
    processId: v.optional(v.string()),
    blastRadiusOf: v.optional(v.string()),
    blastDirection: v.optional(codebaseDirectionValidator),
    blastDepth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<GraphResult> => {
    const neo = await ctx.runQuery(
      internal.codebases.resolveNeo4jAccessInternal,
      { codebaseId: args.codebaseId, userId: ctx.userId },
    );
    if (!neo) throw new Error("Codebase not found");
    return await runWithNeo4jDriver(
      {
        clerkId: neo.ownerClerkId,
        codebaseId: neo.codebaseId,
        kinds: args.kinds,
        processId: args.processId,
        blastRadiusOf: args.blastRadiusOf,
        blastDirection: args.blastDirection,
        blastDepth: args.blastDepth,
      },
      getGraphOverview,
    );
  },
});

// detail-panel payload — metadata + neighbours + processes
export const getContext = authAction({
  args: { codebaseId: v.string(), symbolId: v.string() },
  handler: async (ctx, args): Promise<SymbolContext | null> => {
    const neo = await ctx.runQuery(
      internal.codebases.resolveNeo4jAccessInternal,
      { codebaseId: args.codebaseId, userId: ctx.userId },
    );
    if (!neo) throw new Error("Codebase not found");
    return await runWithNeo4jDriver(
      {
        clerkId: neo.ownerClerkId,
        codebaseId: neo.codebaseId,
        symbolId: args.symbolId,
      },
      getSymbolContext,
    );
  },
});
