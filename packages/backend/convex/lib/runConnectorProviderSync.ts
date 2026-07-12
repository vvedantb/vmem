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
 * Run via retrier or direct `runAction`. Callers pass concrete thunks so
 * each path keeps a fully-typed Convex function reference — a shared
 * generic `dispatchSync(ref, args)` hits OptionalRestArgs because
 * `Args extends EmptyObject` stays unresolved on type parameters.
 */
async function dispatchSync(
  execution: SyncExecution,
  paths: {
    retrier: () => Promise<unknown>;
    direct: () => Promise<unknown>;
  },
): Promise<void> {
  if (execution === "retrier") await paths.retrier();
  else await paths.direct();
}

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
      return dispatchSync(execution, {
        retrier: () => retrier.run(ctx, ref, syncArgs),
        direct: () => ctx.runAction(ref, syncArgs),
      });
    }

    case "gmail": {
      const ref = internal.neo4jActions.connectorSync.syncGmailInternal;
      return dispatchSync(execution, {
        retrier: () => retrier.run(ctx, ref, syncArgs),
        direct: () => ctx.runAction(ref, syncArgs),
      });
    }

    case "notion": {
      const ref = internal.neo4jActions.connectorSync.syncNotionInternal;
      return dispatchSync(execution, {
        retrier: () => retrier.run(ctx, ref, syncArgs),
        direct: () => ctx.runAction(ref, syncArgs),
      });
    }

    case "onedrive": {
      const ref = internal.neo4jActions.connectorSync.syncOneDriveInternal;
      return dispatchSync(execution, {
        retrier: () => retrier.run(ctx, ref, syncArgs),
        direct: () => ctx.runAction(ref, syncArgs),
      });
    }

    case "linear": {
      // Linear is the only provider with a window toggle (30-day vs full).
      const ref = internal.neo4jActions.connectorSync.syncLinearInternal;
      const args = { ...syncArgs, fullHistory: params.fullHistory };
      return dispatchSync(execution, {
        retrier: () => retrier.run(ctx, ref, args),
        direct: () => ctx.runAction(ref, args),
      });
    }

    default:
      throw new Error(`Unsupported provider: ${String(provider)}`);
  }
}
