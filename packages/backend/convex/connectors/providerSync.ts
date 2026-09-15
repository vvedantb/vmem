"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { runGoogleDriveSync } from "./googleDrive";
import { runNotionSync } from "./notion";

export const syncGoogleDriveInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => runGoogleDriveSync(ctx, args),
});

export const syncNotionInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => runNotionSync(ctx, args),
});
