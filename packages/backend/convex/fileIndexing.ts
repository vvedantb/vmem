"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { extractFileContent } from "../engine/parsers/extractFileContent";
import { getDriver } from "../engine/neo4j/driver";
import { getMemory } from "../engine/neo4j/memory/crud";
import { detectFileKind } from "./files/lib";

async function cleanupFileMemory(
  ctx: ActionCtx,
  entry: { memoryId: string; clerkId: string },
  excludeNodeId?: Id<"fileNodes">,
): Promise<void> {
  const stillReferenced = await ctx.runQuery(
    internal.files.hasOtherNodeForMemoryInternal,
    { memoryId: entry.memoryId, excludeNodeId },
  );
  if (stillReferenced) return;

  const memory = await getMemory(getDriver(), entry.clerkId, entry.memoryId);
  if (!memory || memory.sourceType !== "file-node") return;

  await ctx.runAction(internal.neo4jActions.memories.deleteMemoryInternal, {
    clerkId: entry.clerkId,
    memoryId: entry.memoryId,
  });
}

/**
 * Index one file node into the memory graph. Scheduled by `files.ts` on
 * create and overwrite (and by the backfill below). Overwrites delete the
 * previous derived memory and re-create — updating in place would keep a
 * stale embedding and skip re-enrichment.
 */
export const indexFileNodeInternal = internalAction({
  args: { fileNodeId: v.id("fileNodes") },
  handler: async (ctx, args): Promise<void> => {
    const result = await ctx.runQuery(internal.files.getNodeForIndexInternal, {
      fileNodeId: args.fileNodeId,
    });
    // Node already deleted — deleteSubtree scheduled its own cleanup.
    if (!result) return;
    const { node, clerkId } = result;

    const staleMemoryId = node.memoryId;
    const markSkipped = async (): Promise<void> => {
      if (staleMemoryId) {
        await cleanupFileMemory(
          ctx,
          { memoryId: staleMemoryId, clerkId },
          node._id,
        );
      }
      await ctx.runMutation(internal.files.setIndexResultInternal, {
        fileNodeId: args.fileNodeId,
        indexStatus: "skipped",
      });
    };

    if (node.kind !== "file" || !node.storageId) {
      await markSkipped();
      return;
    }

    const kind = detectFileKind(node.name, node.mimeType ?? "");
    if (kind === null) {
      await markSkipped();
      return;
    }

    const blob = await ctx.storage.get(node.storageId);
    if (!blob) {
      await markSkipped();
      return;
    }

    let content: string;
    try {
      content = await extractFileContent(blob, kind);
    } catch (err) {
      console.error(`[fileIndexing] extraction failed for ${node.name}`, err);
      // Old memory (if any) is untouched here — keep the reference.
      await ctx.runMutation(internal.files.setIndexResultInternal, {
        fileNodeId: args.fileNodeId,
        indexStatus: "failed",
        memoryId: staleMemoryId,
      });
      return;
    }

    if (content.trim().length === 0) {
      await markSkipped();
      return;
    }

    let profileId: string;
    if (node.teamId) {
      const teamProfile = await ctx.runQuery(
        internal.profiles.getByTeamInternal,
        { teamId: node.teamId },
      );
      if (!teamProfile) {
        console.error(`[fileIndexing] no profile for team ${node.teamId}`);
        await ctx.runMutation(internal.files.setIndexResultInternal, {
          fileNodeId: args.fileNodeId,
          indexStatus: "failed",
          memoryId: staleMemoryId,
        });
        return;
      }
      profileId = teamProfile._id;
    } else {
      const defaultProfile = await ctx.runMutation(
        internal.profiles.getOrCreateDefaultByClerkIdInternal,
        { clerkId },
      );
      profileId = defaultProfile._id;
    }

    // Overwrite path: drop the previous derived memory so the re-create
    // gets a fresh dedup/embed/enrich/chunk pass.
    if (staleMemoryId) {
      await cleanupFileMemory(
        ctx,
        { memoryId: staleMemoryId, clerkId },
        node._id,
      );
    }

    try {
      const memory = await ctx.runAction(
        internal.neo4jActions.memories.createMemoryInternal,
        {
          clerkId,
          profileId,
          title: node.name,
          content,
          type: "knowledge",
          source: "file-upload",
          tags: ["files", kind],
          confidence: 1.0,
          externalId: node._id,
          sourceType: "file-node",
          storageId: node.storageId,
          mimeType: node.mimeType,
          originalFilename: node.name,
        },
      );
      await ctx.runMutation(internal.files.setIndexResultInternal, {
        fileNodeId: args.fileNodeId,
        indexStatus: "indexed",
        memoryId: memory.id,
      });
    } catch (err) {
      console.error(
        `[fileIndexing] memory create failed for ${node.name}`,
        err,
      );
      await ctx.runMutation(internal.files.setIndexResultInternal, {
        fileNodeId: args.fileNodeId,
        indexStatus: "failed",
      });
    }
  },
});

/**
 * Delete derived memories after their file nodes were removed. Scheduled by
 * `deleteSubtree` post-commit, so the survivor guard sees the deletes. Runs
 * under each node creator's clerkId.
 */
export const cleanupFileMemoriesInternal = internalAction({
  args: {
    entries: v.array(v.object({ memoryId: v.string(), clerkId: v.string() })),
  },
  handler: async (ctx, args): Promise<void> => {
    // A folder delete can contain several identical-content files that
    // collapsed onto one memory — clean each memory once.
    const seen = new Set<string>();
    for (const entry of args.entries) {
      if (seen.has(entry.memoryId)) continue;
      seen.add(entry.memoryId);
      await cleanupFileMemory(ctx, entry);
    }
  },
});

/**
 * One-shot backfill: index every file uploaded before indexing shipped
 * (no `indexStatus` yet). Staggered — each run embeds + enriches through
 * OpenRouter and writes to Neo4j.
 *
 * Run manually: `npx convex run fileIndexing:backfillFileNodeIndex`
 */
export const backfillFileNodeIndex = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    const ids = await ctx.runQuery(
      internal.files.listUnindexedFilesInternal,
      {},
    );
    let delayMs = 0;
    for (const fileNodeId of ids) {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.fileIndexing.indexFileNodeInternal,
        { fileNodeId },
      );
      delayMs += 500;
    }
    return { scheduled: ids.length };
  },
});
