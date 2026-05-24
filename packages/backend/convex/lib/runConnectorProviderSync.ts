import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { retrier } from "../retrier";

export async function runConnectorProviderSync(
  ctx: ActionCtx,
  params: {
    connector: Doc<"connectors">;
    clerkId: string;
    accessToken: string;
    fullHistory: boolean;
  },
): Promise<void> {
  const connectorId = params.connector._id;
  const provider = params.connector.provider;
  if (!provider) {
    throw new Error("Connector does not support sync");
  }

  const syncArgs = {
    clerkId: params.clerkId,
    connectorId,
    accessToken: params.accessToken,
  };

  if (provider === "google_drive") {
    await retrier.run(
      ctx,
      internal.neo4jActions.connectorSync.syncGoogleDriveInternal,
      syncArgs,
    );
    return;
  }

  if (provider === "gmail") {
    await retrier.run(
      ctx,
      internal.neo4jActions.connectorSync.syncGmailInternal,
      syncArgs,
    );
    return;
  }

  if (provider === "notion") {
    await retrier.run(
      ctx,
      internal.neo4jActions.connectorSync.syncNotionInternal,
      syncArgs,
    );
    return;
  }

  if (provider === "onedrive") {
    await retrier.run(
      ctx,
      internal.neo4jActions.connectorSync.syncOneDriveInternal,
      syncArgs,
    );
    return;
  }

  if (provider === "linear") {
    await retrier.run(
      ctx,
      internal.neo4jActions.connectorSync.syncLinearInternal,
      {
        ...syncArgs,
        fullHistory: params.fullHistory,
      },
    );
    return;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
