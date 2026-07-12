"use node";

/**
 * Connector sync internal actions barrel.
 *
 * The single 915-line file was split into the `./connectors/` subdirectory
 * in 2026-Q2. This file is now a pure orchestrator — each `internalAction`
 * delegates to a free `runFooSync(ctx, args)` function, and shared
 * mechanics (profile setup, embedding, progress reporting, error
 * handling) live in `./connectors/shared.ts`.
 *
 * The Convex API path (`internal.neo4jActions.connectorSync.sync*Internal`)
 * is intentionally preserved so call sites in `convex/connectorSync.ts`
 * stay unchanged.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { runGoogleDriveSync } from "./connectors/googleDrive";
import { runLinearSync } from "./connectors/linear";
import { runNotionSync } from "./connectors/notion";
import { runOneDriveSync } from "./connectors/oneDrive";
import { runGmailSync } from "./connectors/gmail";

export const syncGoogleDriveInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => runGoogleDriveSync(ctx, args),
});

export const syncOneDriveInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => runOneDriveSync(ctx, args),
});

export const syncLinearInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
    // When false (default), only pull issues + projects updated in the
    // last 30 days. When true, pull the full history.
    fullHistory: v.boolean(),
  },
  handler: async (ctx, args) => runLinearSync(ctx, args),
});

export const syncGmailInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => runGmailSync(ctx, args),
});

export const syncNotionInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => runNotionSync(ctx, args),
});
