"use node";

/**
 * Shared mechanics for connector sync runs.
 *
 * Every connector (Google Drive, OneDrive, Linear, Notion) follows the
 * same lifecycle: resolve profile + auth, paginate through items, embed
 * + upsert each item, report progress every 10 items, mark complete or
 * error at the end. This file owns the framing; the per-connector files
 * own the listing/fetching specifics.
 */

import type { Driver } from "neo4j-driver";
import { type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { getDriver } from "../../../src/neo4j/driver";
import {
  bestEffortEmbedOneWithAuth,
  resolveBestEffortEmbedAuth,
  type BestEffortEmbedAuth,
} from "../../lib/openRouter/bestEffortEmbed";

/** Resolved auth pair carried through a sync — `null` if the user has no
 *  OPENROUTER_API_KEY configured. */
export type SyncAuth = BestEffortEmbedAuth;

/** Output of `setupSync` — everything every connector handler needs upfront. */
export interface SyncSetup {
  driver: Driver;
  profileId: Id<"profiles">;
  openRouterAuth: SyncAuth | null;
}

/**
 * Resolve the default profile + (optional) OpenRouter auth for a sync run.
 * Reused at the top of every connector handler.
 */
export async function setupSync(
  ctx: ActionCtx,
  clerkId: string,
): Promise<SyncSetup> {
  const driver = getDriver();
  const defaultProfile = await ctx.runMutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  const openRouterAuth = await resolveBestEffortEmbedAuth(ctx, clerkId);
  return { driver, profileId: defaultProfile._id, openRouterAuth };
}

/**
 * Best-effort embedding for a connector-sourced memory. Returns null
 * when the user has no OPENROUTER_API_KEY set or when the embedding
 * request itself fails — sync continues uninterrupted; the backfill
 * migration will fill these in later once a key is configured.
 *
 * Threads `userId` + `profileId` through so the resulting
 * `openRouterLogs` row attributes spend to the right workspace.
 */
export async function embedSyncedDoc(
  ctx: ActionCtx,
  auth: SyncAuth | null,
  profileId: string,
  title: string,
  content: string,
): Promise<number[] | null> {
  return bestEffortEmbedOneWithAuth({
    ctx,
    auth,
    profileId,
    feature: "connector-sync",
    text: `${title}\n\n${content}`,
    failureLog: "connector sync embedding failed",
  });
}

/**
 * Push a progress update every 10 synced items. No-op when the count
 * isn't a multiple of 10 — call this on every item without gating.
 */
export async function maybeReportProgress(
  ctx: ActionCtx,
  params: {
    connectorId: Id<"connectors">;
    totalSynced: number;
    totalFound: number;
  },
): Promise<void> {
  if (params.totalSynced % 10 !== 0) return;
  const progress = Math.min(
    99,
    Math.round(
      (params.totalSynced / Math.max(params.totalFound, params.totalSynced)) *
        100,
    ),
  );
  await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
    id: params.connectorId,
    syncProgress: progress,
    itemsSynced: params.totalSynced,
  });
}

/** Mark sync done at 100% with current timestamp. */
export async function markSyncComplete(
  ctx: ActionCtx,
  params: { connectorId: Id<"connectors">; totalSynced: number },
): Promise<void> {
  await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
    id: params.connectorId,
    syncStatus: "idle",
    syncProgress: 100,
    itemsSynced: params.totalSynced,
    lastSyncAt: Date.now(),
  });
}

/** Mark sync errored with the resolved message. Caller still rethrows. */
export async function markSyncError(
  ctx: ActionCtx,
  params: { connectorId: Id<"connectors">; errorMessage: string },
): Promise<void> {
  await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
    id: params.connectorId,
    syncStatus: "error",
    errorMessage: params.errorMessage,
  });
}
