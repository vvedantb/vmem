"use node";

import { Client as NotionClient } from "@notionhq/client";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  EMBED_CONTENT_CAP,
  markSyncComplete,
  setupSync,
  upsertSyncedDocs,
  withConnectorSyncError,
  type SyncedDoc,
} from "./shared";

/** Markdown endpoint requires Notion-Version >= 2026-03-11; SDK default is older. */
const NOTION_MARKDOWN_API_VERSION = "2026-03-11";

export interface NotionSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
}

export async function runNotionSync(
  ctx: ActionCtx,
  args: NotionSyncArgs,
): Promise<{ synced: number }> {
  const setup = await setupSync(ctx, args.clerkId);

  return withConnectorSyncError(ctx, args.connectorId, "Notion", async () => {
    const notion = new NotionClient({
      auth: args.accessToken,
      notionVersion: NOTION_MARKDOWN_API_VERSION,
    });

    let startCursor: string | undefined;
    let totalSynced = 0;
    let totalFound = 0;

    do {
      const searchResponse = await notion.search({
        filter: { property: "object", value: "page" },
        page_size: 100,
        start_cursor: startCursor,
      });

      const pages = searchResponse.results;
      totalFound += pages.length;

      const pageDocs: SyncedDoc[] = [];
      for (const page of pages) {
        if (page.object !== "page") continue;

        try {
          let title = "Untitled";
          if ("properties" in page) {
            const titleProp = Object.values(page.properties).find(
              (p) => p.type === "title",
            );
            if (titleProp && titleProp.type === "title") {
              title =
                titleProp.title.map((item) => item.plain_text).join("") ||
                "Untitled";
            }
          }

          const markdownResponse = await notion.pages.retrieveMarkdown({
            page_id: page.id,
          });
          const content = markdownResponse.markdown.slice(0, EMBED_CONTENT_CAP);
          const pageUrl =
            "url" in page
              ? page.url
              : `https://notion.so/${page.id.replace(/-/g, "")}`;

          pageDocs.push({
            title,
            content,
            sourceType: "notion",
            sourceId: page.id,
            sourceUrl: pageUrl,
          });
        } catch (pageErr) {
          console.error(`Failed to sync page ${page.id}:`, pageErr);
          // Continue with other pages
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

      startCursor = searchResponse.has_more
        ? (searchResponse.next_cursor ?? undefined)
        : undefined;
    } while (startCursor);

    await markSyncComplete(ctx, {
      connectorId: args.connectorId,
      clerkId: args.clerkId,
      totalSynced,
    });

    return { synced: totalSynced };
  });
}
