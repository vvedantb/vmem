import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./auth";
import { auditLog, ResourceTypes } from "./auditLog";

type ConnectorProvider =
  | "google_drive"
  | "notion"
  | "gmail"
  | "onedrive"
  | "linear";

interface DefaultConnector {
  name: string;
  description: string;
  icon: string;
  provider?: ConnectorProvider;
}

const DEFAULT_CONNECTORS: DefaultConnector[] = [
  {
    name: "Google Drive",
    description: "Sync documents, spreadsheets, and files from Google Drive",
    icon: "IconBrandGoogleDrive",
    provider: "google_drive",
  },
  {
    name: "OneDrive",
    description: "Connect your Microsoft OneDrive files and documents",
    icon: "IconBrandOnedrive",
    provider: "onedrive",
  },
  {
    name: "Dropbox",
    description: "Import files and folders from your Dropbox account",
    icon: "IconBrandDropbox",
    // No provider — Coming Soon stub
  },
  {
    name: "Notion",
    description: "Sync pages, databases, and wikis from Notion",
    icon: "IconBrandNotion",
    provider: "notion",
  },
  {
    name: "Linear",
    description: "Sync issues, comments, and projects from Linear",
    icon: "IconBrandLinear",
    provider: "linear",
  },
  {
    name: "Slack",
    description: "Index messages, files, and conversations from Slack",
    icon: "IconBrandSlack",
    // No provider — Coming Soon stub
  },
  {
    name: "GitHub",
    description: "Connect repositories, issues, and documentation from GitHub",
    icon: "IconBrandGithub",
    // No provider — Coming Soon stub (use dedicated GitHub integration instead)
  },
];

export const listMy = authQuery({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.db
      .query("connectors")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    if (connectors.length > 0) {
      return connectors;
    }

    return [];
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
    const connector = await ctx.db.get(args.id);
    if (!connector || connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }

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
    const connector = await ctx.db.get(args.id);
    if (!connector || connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }

    await ctx.db.patch(args.id, {
      connectionStatus: "disconnected",
      syncStatus: "idle",
      syncProgress: 0,
      itemsSynced: 0,
      lastSyncAt: undefined,
      errorMessage: undefined,
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
    const connector = await ctx.db.get(args.id);
    if (!connector || connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }

    if (connector.connectionStatus !== "connected") {
      throw new Error("Connector is not connected");
    }

    await ctx.db.patch(args.id, {
      syncStatus: "syncing",
      syncProgress: 0,
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
      syncStatus: "idle",
      syncProgress: 0,
      itemsSynced: 0,
      lastSyncAt: undefined,
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
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    // Filter out undefined values
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    if (Object.keys(filteredUpdates).length > 0) {
      await ctx.db.patch(id, filteredUpdates);
    }
  },
});

// --- Migration helper ---

export const migrateAddProviders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.db.query("connectors").collect();

    for (const connector of connectors) {
      if (connector.provider === undefined) {
        let provider: ConnectorProvider | undefined;
        if (connector.name === "Google Drive") {
          provider = "google_drive";
        } else if (connector.name === "Notion") {
          provider = "notion";
        } else if (connector.name === "OneDrive") {
          provider = "onedrive";
        } else if (connector.name === "Linear") {
          provider = "linear";
        }
        if (provider) {
          await ctx.db.patch(connector._id, { provider });
        }
      }
    }
  },
});
