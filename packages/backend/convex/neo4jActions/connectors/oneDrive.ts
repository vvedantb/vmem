"use node";

/**
 * OneDrive connector — lists root-level files via Microsoft Graph (no
 * recursion in MVP), fetches each as plain text using `?format=text`
 * (Word docs are converted server-side), and upserts with
 * `sourceType: "onedrive"`.
 */

import { type ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  markSyncComplete,
  maybeReportProgress,
  setupSync,
  upsertSyncedDoc,
  withConnectorSyncError,
} from "./shared";
import { parseResponseJson } from "../../lib/jsonBoundary";
import { z } from "zod";

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

const oneDriveListResponseSchema = z.object({
  value: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        webUrl: z.string().optional(),
        file: z.object({ mimeType: z.string().optional() }).optional(),
        folder: z.unknown().optional(),
      }),
    )
    .optional(),
  "@odata.nextLink": z.string().optional(),
});

type OneDriveListData = z.infer<typeof oneDriveListResponseSchema>;
type OneDriveItem = NonNullable<OneDriveListData["value"]>[number];
type OneDriveFileItem = OneDriveItem & { file: { mimeType: string } };

function isAllowedOneDriveFile(item: OneDriveItem): item is OneDriveFileItem {
  return (
    item.file !== undefined &&
    item.file.mimeType !== undefined &&
    ONEDRIVE_ALLOWED_MIMETYPES.has(item.file.mimeType)
  );
}

async function fetchOneDriveListPage(
  accessToken: string,
  url: string,
): Promise<OneDriveListData> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(
      `OneDrive list failed: ${response.status} ${response.statusText}`,
    );
  }
  return parseResponseJson(response, oneDriveListResponseSchema);
}

export async function runOneDriveSync(
  ctx: ActionCtx,
  args: OneDriveSyncArgs,
): Promise<{ synced: number }> {
  const setup = await setupSync(ctx, args.clerkId);

  return withConnectorSyncError(ctx, args.connectorId, "OneDrive", async () => {
    // MVP: list root-level files only — no recursion into subfolders.
    let nextUrl: string | null =
      "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=100";
    let totalSynced = 0;
    let totalFound = 0;

    while (nextUrl) {
      const listData = await fetchOneDriveListPage(args.accessToken, nextUrl);

      const items = (listData.value ?? []).filter(isAllowedOneDriveFile);
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
          totalSynced = await upsertSyncedDoc(ctx, {
            setup,
            clerkId: args.clerkId,
            totalSynced,
            doc: {
              title: item.name,
              content: text,
              sourceType: "onedrive",
              sourceId: item.id,
              sourceUrl:
                item.webUrl ??
                `https://onedrive.live.com/?id=${encodeURIComponent(item.id)}`,
            },
          });
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
      clerkId: args.clerkId,
      totalSynced,
    });

    return { synced: totalSynced };
  });
}
