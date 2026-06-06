"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptToken } from "./lib/crypto";
import { PARSER_VERSION } from "../constants/codebase";
import { STALE_SYNCING_MS } from "./codebaseSyncConstants";
import { formatSyncError } from "../engine/codebase/formatSyncError";
import { runCodebaseSync } from "../engine/codebase/runCodebaseSync";
import { ensureNeo4jSetupIfNeeded } from "../engine/neo4j/setup";
import { getDriver } from "../engine/neo4j/driver";
import type { SyncStage } from "../engine/neo4j/codebaseService";

const syncOneResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), message: v.string() }),
);

type SyncOneResult = { ok: true } | { ok: false; message: string };

/**
 * Internal sync entry point used by manual sync, MCP, and the daily workflow.
 * Returns a result instead of throwing so orchestrators can continue on failure.
 */
export const syncOneCodebaseInternal = internalAction({
  args: { codebaseId: v.id("codebases") },
  returns: syncOneResult,
  handler: async (ctx, args): Promise<SyncOneResult> => {
    const codebase = await ctx.runQuery(
      internal.codebases.getByIdForSyncInternal,
      {
        id: args.codebaseId,
      },
    );
    if (!codebase) {
      return { ok: false, message: "Codebase not found" };
    }

    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: codebase.userId,
    });
    if (!clerkId) {
      return { ok: false, message: "User not found" };
    }

    const encryptedToken = await ctx.runQuery(
      internal.github.getDecryptedTokenInternal,
      { userId: codebase.userId },
    );
    if (!encryptedToken) {
      return { ok: false, message: "GitHub not connected" };
    }

    const token = await decryptToken(encryptedToken);
    const normalizedId = args.codebaseId;

    try {
      const fetchNotStarted =
        codebase.syncedFiles === 0 &&
        (codebase.parseStage === "fetching" ||
          codebase.parseStage === undefined);

      if (
        codebase.status === "syncing" &&
        codebase.syncStartedAt !== undefined &&
        Date.now() - codebase.syncStartedAt < STALE_SYNCING_MS &&
        !fetchNotStarted
      ) {
        return { ok: false, message: "Sync already in progress" };
      }

      const syncStartedStale =
        codebase.status === "syncing" &&
        (codebase.syncStartedAt === undefined ||
          Date.now() - codebase.syncStartedAt >= STALE_SYNCING_MS ||
          fetchNotStarted);

      if (syncStartedStale) {
        await ctx.runMutation(internal.codebases.updateStatusInternal, {
          id: normalizedId,
          status: "error",
          errorMessage:
            "Previous sync timed out or was interrupted. Retrying now.",
          lastParseError:
            "Previous sync timed out or was interrupted. Retrying now.",
        });
      }

      await ensureNeo4jSetupIfNeeded(getDriver());

      await ctx.runMutation(internal.codebases.updateStatusInternal, {
        id: normalizedId,
        status: "syncing",
        syncedFiles: 0,
        syncStartedAt: Date.now(),
        errorMessage: undefined,
        lastParseError: undefined,
        parseStage: "fetching",
      });

      const patchStage = async (stage: SyncStage): Promise<void> => {
        await ctx.runMutation(internal.codebases.updateStatusInternal, {
          id: normalizedId,
          parseStage: stage,
        });
      };

      const result = await runCodebaseSync({
        clerkId,
        codebaseId: normalizedId,
        repoOwner: codebase.repoOwner,
        repoName: codebase.repoName,
        branch: codebase.defaultBranch,
        githubToken: token,
        onStage: patchStage,
      });

      await ctx.runMutation(internal.codebases.updateStatusInternal, {
        id: normalizedId,
        status: "synced",
        totalFiles: result.fileCount,
        totalEdges: result.importEdgeCount,
        syncedFiles: result.fileCount,
        lastSyncedAt: Date.now(),
        errorMessage: undefined,
        functionCount: result.functionCount,
        classCount: result.classCount,
        interfaceCount: result.interfaceCount,
        callEdgeCount: result.callEdgeCount,
        processCount: result.processCount,
        parserVersion: PARSER_VERSION,
        lastParseError: undefined,
        parseStage: "done",
      });

      return { ok: true };
    } catch (err) {
      const narrowed =
        typeof err === "string" || err instanceof Error
          ? err
          : typeof err === "object" && err !== null
            ? err
            : null;
      const message = formatSyncError(narrowed);
      console.error(
        "[codebase-sync]",
        normalizedId,
        codebase.repoFullName,
        err,
      );
      await ctx.runMutation(internal.codebases.updateStatusInternal, {
        id: normalizedId,
        status: "error",
        errorMessage: message,
        lastParseError: message,
      });
      return { ok: false, message };
    }
  },
});
