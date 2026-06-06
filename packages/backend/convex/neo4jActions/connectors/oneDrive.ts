"use node";

/**
 * OneDrive connector — lists root-level files via Microsoft Graph (no
 * recursion in MVP), fetches each as plain text using `?format=text`
 * (Word docs are converted server-side), and upserts with
 * `sourceType: "onedrive"`.
 */

import { type ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { upsertFromSource } from "../../../src/neo4j/memory/connectors";
import {
  embedSyncedDoc,
  markSyncComplete,
  markSyncError,
  maybeReportProgress,
  setupSync,
} from "./shared";

export interface OneDriveSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
}

/**
 * MIME types we can import from OneDrive in the MVP.
 *
 * `.docx` is fetched through Graph's `?format=text` endpoint which converts
 * the Word binary to plain text server-side, so we can treat all three the
 * same downstream.
 */
const ONEDRIVE_ALLOWED_MIMETYPES = new Set<string>([
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

interface OneDriveFile {
  mimeType?: string;
}

interface OneDriveItem {
  id: string;
  name: string;
  webUrl?: string;
  file?: OneDriveFile;
  // folder presence indicates a folder (skipped in MVP — root-only)
  folder?: unknown;
}

interface OneDriveListResponse {
  value: OneDriveItem[];
  "@odata.nextLink"?: string;
}

export async function runOneDriveSync(
  ctx: ActionCtx,
  args: OneDriveSyncArgs,
): Promise<{ synced: number }> {
  const { driver, profileId, openRouterAuth } = await setupSync(
    ctx,
    args.clerkId,
  );

  try {
    // MVP: list root-level files only — no recursion into subfolders.
    let nextUrl: string | null =
      "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=100";
    let totalSynced = 0;
    let totalFound = 0;

    while (nextUrl) {
      const listRes = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      });
      if (!listRes.ok) {
        throw new Error(
          `OneDrive list failed: ${listRes.status} ${listRes.statusText}`,
        );
      }
      const listData: OneDriveListResponse = await listRes.json();

      const items = (listData.value ?? []).filter(
        (item) =>
          item.file &&
          item.file.mimeType &&
          ONEDRIVE_ALLOWED_MIMETYPES.has(item.file.mimeType),
      );
      totalFound += items.length;

      for (const item of items) {
        try {
          // `?format=text` asks Graph to convert Word docs to plain text.
          // For text/plain + text/markdown the server ignores it and returns the raw body.
          const contentRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/content?format=text`,
            { headers: { Authorization: `Bearer ${args.accessToken}` } },
          );
          if (!contentRes.ok) {
            console.error(
              `OneDrive content fetch failed for ${item.name}: ${contentRes.status}`,
            );
            continue;
          }
          const text = await contentRes.text();
          const truncatedText = text.slice(0, 50000);
          const embedding = await embedSyncedDoc(
            ctx,
            openRouterAuth,
            profileId,
            item.name,
            truncatedText,
          );

          await upsertFromSource(driver, {
            userId: args.clerkId,
            profileId,
            title: item.name,
            content: truncatedText,
            sourceType: "onedrive",
            sourceId: item.id,
            sourceUrl:
              item.webUrl ??
              `https://onedrive.live.com/?id=${encodeURIComponent(item.id)}`,
            embedding,
          });

          totalSynced++;
          await maybeReportProgress(ctx, {
            connectorId: args.connectorId,
            totalSynced,
            totalFound,
          });
        } catch (itemErr) {
          console.error(`Failed to sync OneDrive item ${item.name}:`, itemErr);
          // Continue with other files
        }
      }

      nextUrl = listData["@odata.nextLink"] ?? null;
    }

    await markSyncComplete(ctx, {
      connectorId: args.connectorId,
      totalSynced,
    });

    return { synced: totalSynced };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "OneDrive sync failed";
    console.error("OneDrive sync error:", err);
    await markSyncError(ctx, {
      connectorId: args.connectorId,
      errorMessage,
    });
    throw err;
  }
}
