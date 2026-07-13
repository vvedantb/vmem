"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  deleteCodebase,
  type SyncStage,
} from "../../engine/neo4j/codebaseService";
import {
  getGraphOverview,
  getOverviewStats,
  getSymbolContext,
  searchSymbols,
} from "../../engine/neo4j/codebase/read";
import {
  getDownstreamImpact,
  getUpstreamImpact,
} from "../../engine/neo4j/codebase/impact";
import { getDriver } from "../../engine/neo4j/driver";
import { runCodebaseSync } from "../../engine/codebase/runCodebaseSync";

export const syncCodebaseInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.string(),
    githubToken: v.string(),
  },
  handler: async (ctx, args) => {
    const docId = await ctx.runQuery(internal.codebases.normalizeCodebaseId, {
      id: args.codebaseId,
    });

    const patchStage = async (stage: SyncStage): Promise<void> => {
      if (!docId) return;
      await ctx.runMutation(internal.codebases.updateStatusInternal, {
        id: docId,
        parseStage: stage,
      });
    };

    return await runCodebaseSync({
      clerkId: args.clerkId,
      codebaseId: args.codebaseId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      branch: args.branch,
      githubToken: args.githubToken,
      onStage: patchStage,
    });
  },
});

export const getOverviewStatsInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    return await getOverviewStats({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
    });
  },
});

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

export const getGraphInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    kinds: v.optional(v.array(kindValidator)),
    processId: v.optional(v.string()),
    blastRadiusOf: v.optional(v.string()),
    blastDirection: v.optional(directionValidator),
    blastDepth: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    return await getGraphOverview({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
      kinds: args.kinds,
      processId: args.processId,
      blastRadiusOf: args.blastRadiusOf,
      blastDirection: args.blastDirection,
      blastDepth: args.blastDepth,
    });
  },
});

export const getSymbolContextInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    symbolId: v.string(),
  },
  handler: async (_ctx, args) => {
    return await getSymbolContext({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
      symbolId: args.symbolId,
    });
  },
});

export const getImpactInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    symbolId: v.string(),
    direction: directionValidator,
    depth: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const nodes =
      args.direction === "upstream"
        ? await getUpstreamImpact({
            driver,
            userId: args.clerkId,
            codebaseId: args.codebaseId,
            symbolId: args.symbolId,
            depth: args.depth,
          })
        : await getDownstreamImpact({
            driver,
            userId: args.clerkId,
            codebaseId: args.codebaseId,
            symbolId: args.symbolId,
            depth: args.depth,
          });
    return { nodes };
  },
});

export const searchSymbolsInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    query: v.string(),
    kind: v.optional(kindValidator),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const results = await searchSymbols({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
      query: args.query,
      kind: args.kind,
      limit: args.limit,
    });
    return { results };
  },
});

/** Legacy graph shape for dashboard callers not yet on getGraphInternal. */
export const getCodebaseGraphInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    const overview = await getGraphOverview({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
      kinds: ["code-file"],
    });
    const nodes = overview.nodes.map((n) => {
      const filename = n.name;
      const ext = filename.includes(".")
        ? filename.slice(filename.lastIndexOf("."))
        : "";
      return {
        id: n.id,
        path: n.path,
        directory: n.directory,
        filename,
        extension: ext,
        sizeBytes: 0,
      };
    });
    const edges = overview.edges
      .filter((e) => e.type === "imports")
      .map((e) => ({
        source: e.fromId,
        target: e.toId,
        importPath: "",
      }));
    return { nodes, edges };
  },
});

export const deleteCodebaseInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    await deleteCodebase(getDriver(), args.clerkId, args.codebaseId);
    return null;
  },
});
