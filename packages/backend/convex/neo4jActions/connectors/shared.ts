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

// AI-generated (Claude), prompt: "upsert connector synced documents into memories with capped embedding and progress reporting"
// Modified by me: embed content cap and sync complete error helpers
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

/**
 * Turn one page of provider items into `SyncedDoc`s. Items the provider can't
 * give us a document for are skipped (return `null`) and items that blow up
 * are logged and skipped so one bad document can't fail the whole sync.
 */
export async function mapSyncedDocs<T>(
  items: T[],
  params: {
    label: string;
    identify: (item: T) => string;
    toDoc: (item: T) => Promise<SyncedDoc | null>;
  },
): Promise<SyncedDoc[]> {
  const docs: SyncedDoc[] = [];
  for (const item of items) {
    try {
      const doc = await params.toDoc(item);
      if (doc !== null) docs.push(doc);
    } catch (err) {
      // Message only: provider SDK errors (Gaxios especially) serialise the
      // whole request/response object and bury the rest of the sync log.
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `Failed to sync ${params.label} ${params.identify(item)}: ${reason}`,
      );
    }
  }
  return docs;
}

export interface ConnectorPage {
  docs: SyncedDoc[];
  /** Items the provider returned for this page, before per-item failures. */
  found: number;
  nextCursor: string | undefined;
}

/**
 * The shared cursor-paginated connector sync: set up the driver/profile/embed
 * auth, walk every page the provider hands back, upsert as we go, and report
 * progress + completion. Providers only supply `fetchPage`.
 */
export async function runPaginatedConnectorSync(
  ctx: ActionCtx,
  params: {
    clerkId: string;
    connectorId: Id<"connectors">;
    label: string;
    fetchPage: (cursor: string | undefined) => Promise<ConnectorPage>;
  },
): Promise<{ synced: number }> {
  const setup = await setupSync(ctx, params.clerkId);

  return withConnectorSyncError(
    ctx,
    params.connectorId,
    params.label,
    async () => {
      let cursor: string | undefined;
      let totalSynced = 0;
      let totalFound = 0;

      do {
        const page = await params.fetchPage(cursor);
        totalFound += page.found;

        totalSynced = await upsertSyncedDocs(ctx, {
          setup,
          clerkId: params.clerkId,
          docs: page.docs,
          totalSynced,
          connectorId: params.connectorId,
          totalFound,
        });

        cursor = page.nextCursor;
      } while (cursor);

      await markSyncComplete(ctx, {
        connectorId: params.connectorId,
        clerkId: params.clerkId,
        totalSynced,
      });

      return { synced: totalSynced };
    },
  );
}
