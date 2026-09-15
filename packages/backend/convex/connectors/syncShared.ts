import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

export const EMBED_CONTENT_CAP = 50_000;

export interface SyncSetup {
  profileId: Id<"profiles">;
}

export async function setupSync(
  ctx: ActionCtx,
  clerkId: string,
): Promise<SyncSetup> {
  const defaultProfile = await ctx.runMutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  return { profileId: defaultProfile._id };
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

  for (const doc of params.docs) {
    const content = doc.content.slice(0, EMBED_CONTENT_CAP);
    try {
      await ctx.runMutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        {
          userId: params.clerkId,
          profileId: params.setup.profileId,
          title: doc.title,
          content,
          sourceType: doc.sourceType,
          sourceId: doc.sourceId,
          sourceUrl: doc.sourceUrl,
        },
      );
    } catch (err) {
      console.error(
        `Failed to sync ${doc.sourceType} doc ${doc.sourceId} (${doc.title}). Continue with other docs.`,
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
  found: number;
  nextCursor: string | undefined;
}

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
