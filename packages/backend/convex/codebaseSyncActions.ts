"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { z } from "zod";
import { decryptToken } from "./lib/crypto";
import { PARSER_VERSION, STALE_SYNCING_MS } from "@vmem/shared";
import { fetchRepositoryFromGithub } from "../engine/github/fetchRepository";
import { ensureNeo4jSetupIfNeeded } from "../engine/neo4j/setup";
import { getDriver } from "../engine/neo4j/driver";
import { syncCodebase, type SyncStage } from "../engine/neo4j/codebaseService";

const errorLikeSchema = z.object({
  message: z.string().optional(),
  data: z.string().optional(),
});

function formatSyncError(err: unknown): string {
  if (typeof err === "string" && err.length > 0) return err;
  if (err instanceof Error) {
    if (err.message.length > 0) return err.message;
    if (err.name.length > 0) return err.name;
  }
  const parsed = errorLikeSchema.safeParse(err);
  if (parsed.success) {
    const { message, data } = parsed.data;
    if (message && message.length > 0) return message;
    if (data && data.length > 0) return data;
  }
  return "Codebase sync failed";
}

const syncOneResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), message: v.string() }),
);

type SyncOneResult = { ok: true } | { ok: false; message: string };

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

      const syncAgeMs =
        codebase.syncStartedAt !== undefined
          ? Date.now() - codebase.syncStartedAt
          : undefined;
      const isActivelySyncing =
        codebase.status === "syncing" &&
        syncAgeMs !== undefined &&
        syncAgeMs < STALE_SYNCING_MS &&
        !fetchNotStarted;

      if (isActivelySyncing) {
        return { ok: false, message: "Sync already in progress" };
      }

      const shouldClearStaleSync =
        codebase.status === "syncing" &&
        (syncAgeMs === undefined ||
          syncAgeMs >= STALE_SYNCING_MS ||
          fetchNotStarted);

      if (shouldClearStaleSync) {
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

      const files = await fetchRepositoryFromGithub(
        codebase.repoOwner,
        codebase.repoName,
        codebase.defaultBranch,
        token,
      );

      const result = await syncCodebase({
        driver: getDriver(),
        userId: clerkId,
        codebaseId: normalizedId,
        files,
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
      const message = formatSyncError(err);
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
      // surface the failure in the inbox, a nightly sync fails with nobody watching, and the error would otherwise only live on the codebase row
      await ctx.runMutation(internal.notifications.pushInternal, {
        userId: codebase.userId,
        title: `Codebase sync failed — ${codebase.repoFullName}`,
        description: message,
        type: "error",
      });
      return { ok: false, message };
    }
  },
});
