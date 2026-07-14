import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { retrier } from "../retrier";

type ProviderSyncRef =
  | typeof internal.neo4jActions.connectorSync.syncGoogleDriveInternal
  | typeof internal.neo4jActions.connectorSync.syncNotionInternal;

export async function runConnectorProviderSync(
  ctx: ActionCtx,
  params: {
    connector: Doc<"connectors">;
    clerkId: string;
    accessToken: string;
    execution: "retrier" | "direct";
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

  let syncRef: ProviderSyncRef;
  switch (provider) {
    case "google_drive":
      syncRef = internal.neo4jActions.connectorSync.syncGoogleDriveInternal;
      break;
    case "notion":
      syncRef = internal.neo4jActions.connectorSync.syncNotionInternal;
      break;
    default:
      throw new Error(`Unsupported provider: ${String(provider)}`);
  }

  if (params.execution === "retrier") {
    await retrier.run(ctx, syncRef, syncArgs);
  } else {
    await ctx.runAction(syncRef, syncArgs);
  }
}
