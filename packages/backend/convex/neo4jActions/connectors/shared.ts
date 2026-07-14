"use node";

import type { Driver } from "neo4j-driver";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { getDriver } from "../../../engine/neo4j/driver";
import { upsertFromSource } from "../../../engine/neo4j/memory/connectors";
import {
  bestEffortEmbedManyWithAuth,
  bestEffortEmbedOneWithAuth,
  resolveBestEffortEmbedAuth,
  type BestEffortEmbedAuth,
} from "../../lib/openRouter/bestEffortEmbed";
import { scheduleDreamTriggerCheck } from "../../lib/dreamTriggerInvalidate";

export const EMBED_CONTENT_CAP = 50_000;

const EMBEDDING_BATCH_SIZE = 20;

export interface SyncSetup {
  driver: Driver;
  profileId: Id<"profiles">;
  openRouterAuth: BestEffortEmbedAuth | null;
}

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

// title + body text fed to the embedder for a synced document
function embedTextForSyncedDoc(title: string, content: string): string {
  return `${title}\n\n${content}`;
}

async function embedSyncedDocChunk(
  ctx: ActionCtx,
  auth: BestEffortEmbedAuth | null,
  profileId: string,
  texts: string[],
): Promise<(number[] | null)[]> {
  let embeddings = await bestEffortEmbedManyWithAuth({
    ctx,
    auth,
    profileId,
    feature: "connector-sync",
    texts,
    failureLog: "connector sync embedding failed",
  });
  if (auth !== null && embeddings.every((e) => e === null)) {
    embeddings = await Promise.all(
      texts.map((text) =>
        bestEffortEmbedOneWithAuth({
          ctx,
          auth,
          profileId,
          feature: "connector-sync",
          text,
          failureLog: "connector sync embedding failed",
        }),
      ),
    );
  }
  return embeddings;
}

export interface SyncedDoc {
  title: string;
  content: string;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
}

export async function upsertSyncedDocs(
  ctx: ActionCtx,
  params: {
    setup: SyncSetup;
    clerkId: string;
    docs: SyncedDoc[];
    totalSynced: number;
    connectorId: Id<"connectors">;
    totalFound: number;
  },
): Promise<number> {
  let totalSynced = params.totalSynced;
  const prepared = params.docs.map((doc) => {
    const content = doc.content.slice(0, EMBED_CONTENT_CAP);
    return { doc, content, text: embedTextForSyncedDoc(doc.title, content) };
  });

  for (
    let offset = 0;
    offset < prepared.length;
    offset += EMBEDDING_BATCH_SIZE
  ) {
    const chunk = prepared.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    const embeddings = await embedSyncedDocChunk(
      ctx,
      params.setup.openRouterAuth,
      params.setup.profileId,
      chunk.map((item) => item.text),
    );

    for (let i = 0; i < chunk.length; i++) {
      const item = chunk[i];
      if (!item) continue;
      const embedding = embeddings[i] ?? null;

      try {
        await upsertFromSource(params.setup.driver, {
          userId: params.clerkId,
          profileId: params.setup.profileId,
          title: item.doc.title,
          content: item.content,
          sourceType: item.doc.sourceType,
          sourceId: item.doc.sourceId,
          sourceUrl: item.doc.sourceUrl,
          embedding,
        });
      } catch (err) {
        console.error(
          `Failed to sync ${item.doc.sourceType} doc ${item.doc.sourceId} (${item.doc.title}). Continue with other docs.`,
          err,
        );
        continue;
      }
      totalSynced += 1;
      await maybeReportProgress(ctx, {
        connectorId: params.connectorId,
        totalSynced,
        totalFound: params.totalFound,
      });
    }
  }

  return totalSynced;
}

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
