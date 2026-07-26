"use node";

// scoped per-API package — monolithic googleapis dominates typecheck time
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { mapSyncedDocs, runPaginatedConnectorSync } from "./shared";

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
  const oauth = new googleAuth.OAuth2();
  oauth.setCredentials({ access_token: args.accessToken });
  const drive = driveApi({ version: "v3", auth: oauth });

  return runPaginatedConnectorSync(ctx, {
    clerkId: args.clerkId,
    connectorId: args.connectorId,
    label: "Google Drive",
    fetchPage: async (cursor) => {
      const listResponse = await drive.files.list({
        q: GOOGLE_DRIVE_MIME_TYPES.map((t) => `mimeType='${t}'`).join(" or "),
        fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
        pageSize: 100,
        pageToken: cursor,
      });

      const files = listResponse.data.files ?? [];

      const docs = await mapSyncedDocs(files, {
        label: "file",
        identify: (file) => file.name ?? file.id ?? "unknown",
        toDoc: async (file) => {
          const fileId = file.id;
          if (!fileId || !file.name) return null;

          const exportResponse = await drive.files.export({
            fileId,
            mimeType: "text/plain",
          });

          const content =
            typeof exportResponse.data === "string"
              ? exportResponse.data
              : String(exportResponse.data);

          return {
            title: file.name,
            content,
            sourceType: "google_drive",
            sourceId: fileId,
            sourceUrl:
              file.webViewLink ?? `https://drive.google.com/file/d/${fileId}`,
          };
        },
      });

      return {
        docs,
        found: files.length,
        nextCursor: listResponse.data.nextPageToken ?? undefined,
      };
    },
  });
}
