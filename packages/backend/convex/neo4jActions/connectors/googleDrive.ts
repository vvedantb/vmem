"use node";

/**
 * Google Drive connector — lists Docs / Sheets / Slides under the user's
 * account, exports each as plain text via Drive's export endpoint, and
 * upserts the result into Neo4j with `sourceType: "google_drive"`.
 */

// Scoped per-API package instead of the monolithic "googleapis" — the monolith's
// root types pull in every Google API (~1M lines of .d.ts) and dominated typecheck time.
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { type ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { upsertFromSource } from "../../../engine/neo4j/memory/connectors";
import {
  embedSyncedDoc,
  markSyncComplete,
  markSyncError,
  maybeReportProgress,
  setupSync,
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
  const { driver, profileId, openRouterAuth } = await setupSync(
    ctx,
    args.clerkId,
  );

  try {
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

          const truncatedContent = content.slice(0, 50000);
          const embedding = await embedSyncedDoc(
            ctx,
            openRouterAuth,
            profileId,
            file.name,
            truncatedContent,
          );

          await upsertFromSource(driver, {
            userId: args.clerkId,
            profileId,
            title: file.name,
            content: truncatedContent,
            sourceType: "google_drive",
            sourceId: file.id,
            sourceUrl:
              file.webViewLink ?? `https://drive.google.com/file/d/${file.id}`,
            embedding,
          });

          totalSynced++;
          await maybeReportProgress(ctx, {
            connectorId: args.connectorId,
            totalSynced,
            totalFound,
          });
        } catch (fileErr) {
          console.error(`Failed to sync file ${file.name}:`, fileErr);
          // Continue with other files
        }
      }

      pageToken = listResponse.data.nextPageToken ?? undefined;
    } while (pageToken);

    await markSyncComplete(ctx, {
      connectorId: args.connectorId,
      clerkId: args.clerkId,
      totalSynced,
    });

    return { synced: totalSynced };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Google Drive sync failed";
    console.error("Google Drive sync error:", err);
    await markSyncError(ctx, {
      connectorId: args.connectorId,
      errorMessage,
    });
    throw err;
  }
}
