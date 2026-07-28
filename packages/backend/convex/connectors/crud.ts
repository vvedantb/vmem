import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { authAction, authMutation, authQuery, requireClerkId } from "../auth";
import { internal } from "../_generated/api";
import { auditLog, ResourceTypes } from "../auditLog";
import { STALE_SYNCING_MS } from "@vmem/shared";
import {
  connectorConnectionStatusValidator,
  connectorFields,
  connectorSyncStatusValidator,
} from "../validators";

type ConnectorProvider = NonNullable<Doc<"connectors">["provider"]>;

interface DefaultConnector {
  name: string;
  description: string;
  icon: string;
  provider?: ConnectorProvider;
}

const DISCONNECTED_SYNC_RESET = {
  syncStatus: "idle" as const,
  syncProgress: 0,
  itemsSynced: 0,
  lastSyncAt: undefined,
  errorMessage: undefined,
};

async function requireOwnedConnector(
  ctx: MutationCtx & { userId: Id<"users"> },
  id: Id<"connectors">,
): Promise<Doc<"connectors">> {
  const connector = await ctx.db.get(id);
  if (!connector || connector.userId !== ctx.userId) {
    throw new Error("Connector not found");
  }
  return connector;
}

const DEFAULT_CONNECTORS: DefaultConnector[] = [
  {
    name: "Google Drive",
    description: "Sync documents, spreadsheets, and files from Google Drive",
    icon: "IconBrandGoogleDrive",
    provider: "google_drive",
  },
  {
    name: "Notion",
    description: "Sync pages, databases, and wikis from Notion",
    icon: "IconBrandNotion",
    provider: "notion",
  },
  {
    name: "GitHub",
    description: "Connect repositories, issues, and documentation from GitHub",
    icon: "IconBrandGithub",
    // no provider: dedicated github integration (githubConnections)
  },
];

export const listMy = authQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("connectors")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
  },
});

export const seedDefaults = authMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("connectors")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    const existingByName = new Map(existing.map((c) => [c.name, c]));

    for (const connector of DEFAULT_CONNECTORS) {
      const existingConnector = existingByName.get(connector.name);

      if (existingConnector) {
        // backfill provider on rows created before the field existed
        if (connector.provider && !existingConnector.provider) {
          await ctx.db.patch(existingConnector._id, {
            provider: connector.provider,
          });
        }
        continue;
      }

      await ctx.db.insert("connectors", {
        userId: ctx.userId,
        name: connector.name,
        description: connector.description,
        icon: connector.icon,
        provider: connector.provider,
        connectionStatus: "disconnected",
        syncStatus: "idle",
        syncProgress: 0,
        itemsSynced: 0,
      });
    }
  },
});

export const connect = authMutation({
  args: { id: v.id("connectors") },
  handler: async (ctx, args) => {
    const connector = await requireOwnedConnector(ctx, args.id);

    await ctx.db.patch(args.id, {
      connectionStatus: "connected",
    });

    await auditLog.log(ctx, {
      action: "connector.connected",
      actorId: ctx.userId,
      resourceType: ResourceTypes.CONNECTOR,
      resourceId: args.id,
      metadata: { name: connector.name, provider: connector.provider ?? null },
      severity: "info",
    });
  },
});

export const disconnect = authMutation({
  args: { id: v.id("connectors") },
  handler: async (ctx, args) => {
    const connector = await requireOwnedConnector(ctx, args.id);

    await ctx.db.patch(args.id, {
      connectionStatus: "disconnected",
      ...DISCONNECTED_SYNC_RESET,
    });

    await auditLog.log(ctx, {
      action: "connector.disconnected",
      actorId: ctx.userId,
      resourceType: ResourceTypes.CONNECTOR,
      resourceId: args.id,
      metadata: { name: connector.name, provider: connector.provider ?? null },
      severity: "warning",
    });
  },
});

export const sync = authMutation({
  args: { id: v.id("connectors") },
  handler: async (ctx, args) => {
    const connector = await requireOwnedConnector(ctx, args.id);

    if (connector.connectionStatus !== "connected") {
      throw new Error("Connector is not connected");
    }

    await ctx.db.patch(args.id, {
      syncStatus: "syncing",
      syncProgress: 0,
      syncStartedAt: Date.now(),
      errorMessage: undefined,
    });
  },
});

export const getByIdInternal = internalQuery({
  args: { id: v.id("connectors") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

const DAILY_SYNC_PROVIDERS = new Set<ConnectorProvider>([
  "google_drive",
  "notion",
]);

export const listForDailyConnectorSyncInternal = internalQuery({
  args: {},
  returns: v.array(v.object({ connectorId: v.id("connectors") })),
  handler: async (ctx) => {
    const all = await ctx.db.query("connectors").collect();
    const out: Array<{ connectorId: Id<"connectors"> }> = [];

    for (const row of all) {
      if (row.connectionStatus !== "connected") continue;
      if (!row.provider || !DAILY_SYNC_PROVIDERS.has(row.provider)) continue;

      if (isFreshSyncing(row)) continue;

      out.push({ connectorId: row._id });
    }

    return out;
  },
});

const googleConnectorRowValidator = v.object({
  _id: v.id("connectors"),
  provider: v.literal("google_drive"),
  connectionStatus: connectorConnectionStatusValidator,
});

export const listGoogleConnectorsForUserInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(googleConnectorRowValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("connectors")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const googleRows = [];

    for (const row of rows) {
      if (row.provider !== "google_drive") continue;
      googleRows.push({
        _id: row._id,
        provider: row.provider,
        connectionStatus: row.connectionStatus,
      });
    }

    return googleRows;
  },
});

export const markConnectedInternal = internalMutation({
  args: { id: v.id("connectors") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      connectionStatus: "connected",
    });
  },
});

export const markDisconnectedInternal = internalMutation({
  args: { id: v.id("connectors") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      connectionStatus: "disconnected",
      ...DISCONNECTED_SYNC_RESET,
    });
  },
});

export const resetSyncStatsInternal = internalMutation({
  args: { id: v.id("connectors") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      syncStatus: "idle",
      syncProgress: 0,
      itemsSynced: 0,
      lastSyncAt: undefined,
      syncStartedAt: undefined,
      errorMessage: undefined,
    });
  },
});

export const updateSyncProgressInternal = internalMutation({
  args: {
    id: v.id("connectors"),
    syncProgress: v.optional(connectorFields.syncProgress),
    itemsSynced: v.optional(connectorFields.itemsSynced),
    syncStatus: v.optional(connectorSyncStatusValidator),
    lastSyncAt: connectorFields.lastSyncAt,
    syncStartedAt: connectorFields.syncStartedAt,
    errorMessage: connectorFields.errorMessage,
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const patch = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(id, patch);
    }
  },
});

export const deleteConnectorData = authAction({
  args: { connectorId: v.id("connectors") },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const connector = await ctx.runQuery(
      internal.connectors.crud.getByIdInternal,
      {
        id: args.connectorId,
      },
    );
    if (!connector || connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }
    if (!connector.provider) {
      throw new Error("Connector does not support data deletion");
    }

    const deleted = await ctx.runAction(
      internal.neo4jActions.connectorData.deleteBySourceTypesInternal,
      {
        clerkId: await requireClerkId(ctx),
        sourceTypes: [connector.provider],
      },
    );

    await ctx.runMutation(internal.connectors.crud.resetSyncStatsInternal, {
      id: args.connectorId,
    });

    await auditLog.log(ctx, {
      action: "connector.data_deleted",
      actorId: ctx.userId,
      resourceType: ResourceTypes.CONNECTOR,
      resourceId: args.connectorId,
      metadata: {
        name: connector.name,
        provider: connector.provider,
        deletedCount: deleted,
      },
      severity: "warning",
    });

    return deleted;
  },
});

export function isFreshSyncing(
  row: Pick<Doc<"connectors">, "syncStatus" | "syncStartedAt">,
): boolean {
  return (
    row.syncStatus === "syncing" &&
    row.syncStartedAt !== undefined &&
    Date.now() - row.syncStartedAt < STALE_SYNCING_MS
  );
}
