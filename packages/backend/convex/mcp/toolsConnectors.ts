import { z } from "zod";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { runDeleteConnectorData } from "../connectors/crud";
import { runDisconnect } from "../connectors/oauth";
import { runStartSync } from "../connectors/sync";
import {
  authActionCtx,
  confirmParam,
  emptyInputSchema,
  toolSpec,
  type ToolHandlerContext,
} from "./toolTypes";

// Connectors belong to the user, so these are personal-connector tools.
// Connecting needs the browser OAuth flow (Settings > Connectors).

const connectorIdParam = z
  .string()
  .describe("Connector id from connectors_list");

const connectorIdSchema = z.object({ connectorId: connectorIdParam });

const connectorsDeleteDataSchema = z.object({
  connectorId: connectorIdParam,
  confirm: confirmParam.describe(
    "Must be true: every memory imported by this connector is deleted permanently",
  ),
});

function mapConnector(connector: Doc<"connectors">) {
  return {
    id: connector._id,
    name: connector.name,
    description: connector.description,
    provider: connector.provider ?? null,
    connectionStatus: connector.connectionStatus,
    syncStatus: connector.syncStatus,
    syncProgress: connector.syncProgress,
    itemsSynced: connector.itemsSynced,
    lastSyncAt:
      connector.lastSyncAt === undefined
        ? null
        : new Date(connector.lastSyncAt).toISOString(),
    errorMessage: connector.errorMessage ?? null,
  };
}

async function requireOwnedConnectorId(
  h: ToolHandlerContext,
  connectorId: string,
): Promise<Id<"connectors">> {
  const id = await h.ctx.runQuery(
    internal.connectors.crud.getOwnedIdByClerkIdInternal,
    { clerkId: h.clerkUserId, connectorId },
  );
  if (id === null) throw new Error("Connector not found");
  return id;
}

export const connectorsToolSpecs = {
  connectors_list: toolSpec({
    name: "connectors_list",
    schema: emptyInputSchema,
    description:
      "List your source connectors (Google Drive, Notion, Gmail, Figma, GitHub) with connectionStatus, syncStatus, syncProgress, itemsSynced, lastSyncAt and errorMessage. Connecting a new one needs the browser: Settings > Connectors in the vmem web app.",
    errorLabel: "List connectors failed",
    scopes: ["personal"],
    async run(h): Promise<unknown> {
      const rows = await h.ctx.runMutation(
        internal.connectors.crud.seedAndListByClerkIdInternal,
        { clerkId: h.clerkUserId },
      );
      return rows.map(mapConnector);
    },
  }),
  connectors_sync: toolSpec({
    name: "connectors_sync",
    schema: connectorIdSchema,
    description:
      "Start a sync now for a connected connector (the web Sync now button). The sync runs in the background; poll connectors_list for progress.",
    errorLabel: "Sync connector failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      const id = await requireOwnedConnectorId(h, params.connectorId);
      return runStartSync(await authActionCtx(h), id);
    },
  }),
  connectors_disconnect: toolSpec({
    name: "connectors_disconnect",
    schema: connectorIdSchema,
    description:
      "Disconnect a connector: revoke and delete its OAuth tokens and reset its sync state. Imported memories stay; use connectors_delete_data to remove them. Reconnecting needs the browser.",
    errorLabel: "Disconnect connector failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      const id = await requireOwnedConnectorId(h, params.connectorId);
      await runDisconnect(await authActionCtx(h), id);
      return { disconnected: true };
    },
  }),
  connectors_delete_data: toolSpec({
    name: "connectors_delete_data",
    schema: connectorsDeleteDataSchema,
    description:
      "Permanently delete every memory this connector imported and reset its sync stats. The connection itself stays. Requires confirm: true.",
    errorLabel: "Delete connector data failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      const id = await requireOwnedConnectorId(h, params.connectorId);
      return {
        deleted: await runDeleteConnectorData(await authActionCtx(h), id),
      };
    },
  }),
};
