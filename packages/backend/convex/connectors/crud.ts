import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { authMutation, authQuery } from "../auth";
import { auditLog, ResourceTypes } from "../auditLog";
import { STALE_SYNCING_MS } from "../codebaseSyncConstants";

type ConnectorProvider = "google_drive" | "notion";

interface DefaultConnector {
  name: string;
  description: string;
  icon: string;
  provider?: ConnectorProvider;
}

/** Shared reset applied whenever a connector is marked disconnected. */
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

const CONNECTOR_NAME_TO_PROVIDER: Record<string, ConnectorProvider> = {
  "Google Drive": "google_drive",
  Notion: "notion",
};

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
    // No provider — dedicated GitHub integration (githubConnections)
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
        // Update provider if missing (migration for existing connectors)
        if (connector.provider && !existingConnector.provider) {
          await ctx.db.patch(existingConnector._id, {
            provider: connector.provider,
          });
        }
      } else {
        // Create new connector
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

// --- Internal mutations and queries for OAuth flow ---

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

/**
 * Connected connectors eligible for the global 04:00 UTC daily workflow.
 * Skips in-progress syncs; always runs a full ingest (no lastSyncAt cutoff).
 */
export const listForDailyConnectorSyncInternal = internalQuery({
  args: {},
  returns: v.array(v.object({ connectorId: v.id("connectors") })),
  handler: async (ctx) => {
    const all = await ctx.db.query("connectors").collect();
    const out: Array<{ connectorId: Id<"connectors"> }> = [];

    for (const row of all) {
      if (row.connectionStatus !== "connected") continue;
      if (!row.provider || !DAILY_SYNC_PROVIDERS.has(row.provider)) continue;

      const syncingFresh =
        row.syncStatus === "syncing" &&
        row.syncStartedAt !== undefined &&
        Date.now() - row.syncStartedAt < STALE_SYNCING_MS;
      if (row.syncStatus === "syncing" && syncingFresh) continue;

      out.push({ connectorId: row._id });
    }

    return out;
  },
});

const googleConnectorRowValidator = v.object({
  _id: v.id("connectors"),
  provider: v.literal("google_drive"),
  connectionStatus: v.union(v.literal("connected"), v.literal("disconnected")),
});

export const listGoogleConnectorsForUserInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(googleConnectorRowValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("connectors")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const googleRows: Array<{
      _id: Id<"connectors">;
      provider: "google_drive";
      connectionStatus: "connected" | "disconnected";
    }> = [];

    for (const row of rows) {
      if (row.provider !== "google_drive") {
        continue;
      }
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
    syncProgress: v.optional(v.number()),
    itemsSynced: v.optional(v.number()),
    syncStatus: v.optional(
      v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")),
    ),
    lastSyncAt: v.optional(v.number()),
    syncStartedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
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

// --- Migration helper ---

export const migrateAddProviders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.db.query("connectors").collect();

    for (const connector of connectors) {
      if (connector.provider !== undefined) continue;
      const provider = CONNECTOR_NAME_TO_PROVIDER[connector.name];
      if (provider) {
        await ctx.db.patch(connector._id, { provider });
      }
    }
  },
});
