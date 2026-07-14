"use node";

// scoped per-API package — monolithic googleapis dominates typecheck time
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  markSyncComplete,
  setupSync,
  upsertSyncedDocs,
  withConnectorSyncError,
  type SyncedDoc,
} from "./shared";

export interface GoogleDriveSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
}

const GOOGLE_DRIVE_MIME_TYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
];

export async function runGoogleDriveSync(
  ctx: ActionCtx,
  args: GoogleDriveSyncArgs,
): Promise<{ synced: number }> {
  const setup = await setupSync(ctx, args.clerkId);

  return withConnectorSyncError(
    ctx,
    args.connectorId,
    "Google Drive",
    async () => {
      const oauth = new googleAuth.OAuth2();
      oauth.setCredentials({ access_token: args.accessToken });
      const drive = driveApi({ version: "v3", auth: oauth });

      let pageToken: string | undefined;
      let totalSynced = 0;
      let totalFound = 0;

      do {
        const listResponse = await drive.files.list({
          q: GOOGLE_DRIVE_MIME_TYPES.map((t) => `mimeType='${t}'`).join(" or "),
          fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
          pageSize: 100,
          pageToken,
        });

        const files = listResponse.data.files ?? [];
        totalFound += files.length;

        const pageDocs: SyncedDoc[] = [];
        for (const file of files) {
          if (!file.id || !file.name) continue;

          try {
            const exportResponse = await drive.files.export({
              fileId: file.id,
              mimeType: "text/plain",
            });

            const content =
              typeof exportResponse.data === "string"
                ? exportResponse.data
                : String(exportResponse.data);

            pageDocs.push({
              title: file.name,
              content,
              sourceType: "google_drive",
              sourceId: file.id,
              sourceUrl:
                file.webViewLink ??
                `https://drive.google.com/file/d/${file.id}`,
            });
          } catch (fileErr) {
            console.error(`Failed to sync file ${file.name}:`, fileErr);
            // continue with other files
          }
        }

        totalSynced = await upsertSyncedDocs(ctx, {
          setup,
          clerkId: args.clerkId,
          docs: pageDocs,
          totalSynced,
          connectorId: args.connectorId,
          totalFound,
        });

        pageToken = listResponse.data.nextPageToken ?? undefined;
      } while (pageToken);

      await markSyncComplete(ctx, {
        connectorId: args.connectorId,
        clerkId: args.clerkId,
        totalSynced,
      });

      return { synced: totalSynced };
    },
  );
}
