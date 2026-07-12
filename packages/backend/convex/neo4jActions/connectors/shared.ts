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
import { getDriver } from "../../../engine/neo4j/driver";
import { upsertFromSource } from "../../../engine/neo4j/memory/connectors";
import {
  bestEffortEmbedOneWithAuth,
  resolveBestEffortEmbedAuth,
  type BestEffortEmbedAuth,
} from "../../lib/openRouter/bestEffortEmbed";
import { scheduleDreamTriggerCheck } from "../../lib/dreamTriggerInvalidate";

/** Max chars of a synced document's body sent to the embedder / stored. */
export const EMBED_CONTENT_CAP = 50_000;

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
 *
 * Internal to this module — connectors now go through `upsertSyncedDoc`,
 * which owns the embed → upsert sequence.
 */
async function embedSyncedDoc(
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

/** One synced document — the per-item data each connector produces. */
export interface SyncedDoc {
  title: string;
  content: string;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
}

/**
 * Embed + upsert one synced document and return the incremented synced
 * count. Truncates the body to the embedding cap, best-effort embeds, then
 * upserts into Neo4j under the given sourceType. Shared verbatim by every
 * connector's per-item body so the truncate → embed → upsert sequence and
 * the content cap live in one place and the connector loops cannot drift.
 *
 * Returns `totalSynced + 1` rather than reporting progress itself: the
 * caller assigns the new count and then calls `maybeReportProgress`, so a
 * progress-report failure never un-counts an item that was already upserted
 * (matching the original per-connector ordering exactly).
 */
export async function upsertSyncedDoc(
  ctx: ActionCtx,
  params: {
    setup: SyncSetup;
    clerkId: string;
    doc: SyncedDoc;
    totalSynced: number;
  },
): Promise<number> {
  const content = params.doc.content.slice(0, EMBED_CONTENT_CAP);
  const embedding = await embedSyncedDoc(
    ctx,
    params.setup.openRouterAuth,
    params.setup.profileId,
    params.doc.title,
    content,
  );
  await upsertFromSource(params.setup.driver, {
    userId: params.clerkId,
    profileId: params.setup.profileId,
    title: params.doc.title,
    content,
    sourceType: params.doc.sourceType,
    sourceId: params.doc.sourceId,
    sourceUrl: params.doc.sourceUrl,
    embedding,
  });
  return params.totalSynced + 1;
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
  await ctx.runMutation(internal.connectors.crud.updateSyncProgressInternal, {
    id: params.connectorId,
    syncProgress: progress,
    itemsSynced: params.totalSynced,
  });
}

/** Mark sync done at 100% with current timestamp. Counts the synced
 *  batch toward the Dynamic Dreaming trigger in one bump — an import is
 *  exactly the "enough new context piled up" signal a dream feeds on. */
export async function markSyncComplete(
  ctx: ActionCtx,
  params: {
    connectorId: Id<"connectors">;
    totalSynced: number;
    clerkId: string;
  },
): Promise<void> {
  await ctx.runMutation(internal.connectors.crud.updateSyncProgressInternal, {
    id: params.connectorId,
    syncStatus: "idle",
    syncProgress: 100,
    itemsSynced: params.totalSynced,
    lastSyncAt: Date.now(),
    syncStartedAt: undefined,
  });
  if (params.totalSynced > 0) {
    await scheduleDreamTriggerCheck(ctx, params.clerkId, params.totalSynced);
  }
}

/** Mark sync errored with the resolved message. Caller still rethrows. */
export async function markSyncError(
  ctx: ActionCtx,
  params: { connectorId: Id<"connectors">; errorMessage: string },
): Promise<void> {
  await ctx.runMutation(internal.connectors.crud.updateSyncProgressInternal, {
    id: params.connectorId,
    syncStatus: "error",
    errorMessage: params.errorMessage,
  });
}

/**
 * Wrap a connector sync body with the shared outer try/catch: log, mark
 * sync error, rethrow. `label` is used in the fallback message and log
 * prefix (e.g. `"Gmail"` → `"Gmail sync failed"`).
 */
export async function withConnectorSyncError<T>(
  ctx: ActionCtx,
  connectorId: Id<"connectors">,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : `${label} sync failed`;
    console.error(`${label} sync error:`, err);
    await markSyncError(ctx, { connectorId, errorMessage });
    throw err;
  }
}
