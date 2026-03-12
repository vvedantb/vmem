import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";

const DEFAULT_CONNECTORS = [
  {
    name: "Google Drive",
    description: "Sync documents, spreadsheets, and files from Google Drive",
    icon: "IconBrandGoogleDrive",
  },
  {
    name: "OneDrive",
    description: "Connect your Microsoft OneDrive files and documents",
    icon: "IconBrandOnedrive",
  },
  {
    name: "Dropbox",
    description: "Import files and folders from your Dropbox account",
    icon: "IconBrandDropbox",
  },
  {
    name: "Notion",
    description: "Sync pages, databases, and wikis from Notion",
    icon: "IconBrandNotion",
  },
  {
    name: "Slack",
    description: "Index messages, files, and conversations from Slack",
    icon: "IconBrandSlack",
  },
  {
    name: "GitHub",
    description: "Connect repositories, issues, and documentation from GitHub",
    icon: "IconBrandGithub",
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
      .first();

    if (existing) {
      return;
    }

    for (const connector of DEFAULT_CONNECTORS) {
      await ctx.db.insert("connectors", {
        userId: ctx.userId,
        name: connector.name,
        description: connector.description,
        icon: connector.icon,
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
    const connector = await ctx.db.get(args.id);
    if (!connector || connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }

    await ctx.db.patch(args.id, {
      connectionStatus: "connected",
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
