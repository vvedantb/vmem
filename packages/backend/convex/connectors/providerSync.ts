"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { runFigmaSync } from "./figma";
import { runGitHubSync } from "./github";
import { runGmailSync } from "./gmail";
import { runGoogleDriveSync } from "./googleDrive";
import { runNotionSync } from "./notion";

const providerSyncArgs = {
  clerkId: v.string(),
  connectorId: v.id("connectors"),
  accessToken: v.string(),
};

export const syncGoogleDriveInternal = internalAction({
  args: providerSyncArgs,
  handler: async (ctx, args) => runGoogleDriveSync(ctx, args),
});

export const syncNotionInternal = internalAction({
  args: providerSyncArgs,
  handler: async (ctx, args) => runNotionSync(ctx, args),
});

export const syncGmailInternal = internalAction({
  args: providerSyncArgs,
  handler: async (ctx, args) => runGmailSync(ctx, args),
});

export const syncFigmaInternal = internalAction({
  args: providerSyncArgs,
  handler: async (ctx, args) => runFigmaSync(ctx, args),
});

export const syncGitHubInternal = internalAction({
  args: providerSyncArgs,
  handler: async (ctx, args) => runGitHubSync(ctx, args),
});
