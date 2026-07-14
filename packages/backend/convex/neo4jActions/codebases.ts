"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  deleteCodebase,
  type SyncStage,
} from "../../engine/neo4j/codebaseService";
import { getGraphOverview } from "../../engine/neo4j/codebase/read";
import { runCodebaseSync } from "../../engine/codebase/runCodebaseSync";
import { runWithNeo4jDriver } from "./_shared/driver";

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

/** Legacy graph shape for dashboard callers not yet on getGraph. */
export const getCodebaseGraphInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) =>
    runWithNeo4jDriver(args, async ({ driver, userId, codebaseId }) => {
      const overview = await getGraphOverview({
        driver,
        userId,
        codebaseId,
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
    }),
});

export const deleteCodebaseInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    await runWithNeo4jDriver(args, ({ driver, userId, codebaseId }) =>
      deleteCodebase(driver, userId, codebaseId),
    );
    return null;
  },
});
