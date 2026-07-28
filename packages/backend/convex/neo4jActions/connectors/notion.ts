"use node";

import { Client as NotionClient } from "@notionhq/client";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  EMBED_CONTENT_CAP,
  mapSyncedDocs,
  runPaginatedConnectorSync,
} from "./shared";

// markdown endpoint requires notion version >= 2026 03 11. sdk default is older
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
  const notion = new NotionClient({
    auth: args.accessToken,
    notionVersion: NOTION_MARKDOWN_API_VERSION,
  });

  return runPaginatedConnectorSync(ctx, {
    clerkId: args.clerkId,
    connectorId: args.connectorId,
    label: "Notion",
    fetchPage: async (cursor) => {
      const searchResponse = await notion.search({
        filter: { property: "object", value: "page" },
        page_size: 100,
        start_cursor: cursor,
      });

      const pages = searchResponse.results;

      const docs = await mapSyncedDocs(pages, {
        label: "page",
        identify: (page) => page.id,
        toDoc: async (page) => {
          if (page.object !== "page") return null;

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

          return {
            title,
            content: markdownResponse.markdown.slice(0, EMBED_CONTENT_CAP),
            sourceType: "notion",
            sourceId: page.id,
            sourceUrl:
              "url" in page
                ? page.url
                : `https://notion.so/${page.id.replace(/-/g, "")}`,
          };
        },
      });

      return {
        docs,
        found: pages.length,
        nextCursor: searchResponse.has_more
          ? (searchResponse.next_cursor ?? undefined)
          : undefined,
      };
    },
  });
}
