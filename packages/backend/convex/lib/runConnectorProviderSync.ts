import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { retrier } from "../retrier";

/**
 * How the provider sync runs. Both strategies dispatch to the same
 * registered `sync*Internal` node actions — only the invocation differs:
 *   - "retrier": scheduled via the action retrier (fire-and-forget with
 *     backoff). Used by the public `startSync` action, which returns
 *     immediately while the sync runs in the background.
 *   - "direct": `ctx.runAction` awaited to completion. Used by
 *     `syncOneConnectorInternal` (daily workflow / manual MCP), which
 *     needs the sync to finish so it can report ok/error to its caller.
 *
 * Routing through the internal-action references (rather than importing
 * the `run*Sync` functions) keeps this module free of `googleapis` and
 * other node-only deps, so it stays loadable from the V8-runtime public
 * action that schedules background syncs.
 */
export type SyncExecution = "retrier" | "direct";

/**
 * Single source of truth for which providers support sync and how each
 * one is dispatched. Both execution strategies share this one switch, so
 * adding a provider is a single `case` — no second dispatch table to keep
 * in sync.
 */
export async function runConnectorProviderSync(
  ctx: ActionCtx,
  params: {
    connector: Doc<"connectors">;
    clerkId: string;
    accessToken: string;
    fullHistory: boolean;
    execution: SyncExecution;
  },
): Promise<void> {
  const provider = params.connector.provider;
  if (!provider) {
    throw new Error("Connector does not support sync");
  }

  const syncArgs = {
    clerkId: params.clerkId,
    connectorId: params.connector._id,
    accessToken: params.accessToken,
  };
  const { execution } = params;

  switch (provider) {
    case "google_drive": {
      const ref = internal.neo4jActions.connectorSync.syncGoogleDriveInternal;
      if (execution === "retrier") await retrier.run(ctx, ref, syncArgs);
      else await ctx.runAction(ref, syncArgs);
      return;
    }

    case "gmail": {
      const ref = internal.neo4jActions.connectorSync.syncGmailInternal;
      if (execution === "retrier") await retrier.run(ctx, ref, syncArgs);
      else await ctx.runAction(ref, syncArgs);
      return;
    }

    case "notion": {
      const ref = internal.neo4jActions.connectorSync.syncNotionInternal;
      if (execution === "retrier") await retrier.run(ctx, ref, syncArgs);
      else await ctx.runAction(ref, syncArgs);
      return;
    }

    case "onedrive": {
      const ref = internal.neo4jActions.connectorSync.syncOneDriveInternal;
      if (execution === "retrier") await retrier.run(ctx, ref, syncArgs);
      else await ctx.runAction(ref, syncArgs);
      return;
    }

    case "linear": {
      // Linear is the only provider with a window toggle (30-day vs full).
      const ref = internal.neo4jActions.connectorSync.syncLinearInternal;
      const linearArgs = { ...syncArgs, fullHistory: params.fullHistory };
      if (execution === "retrier") await retrier.run(ctx, ref, linearArgs);
      else await ctx.runAction(ref, linearArgs);
      return;
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
