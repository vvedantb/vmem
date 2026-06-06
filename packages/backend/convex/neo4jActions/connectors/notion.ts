"use node";

/**
 * Notion connector — searches for pages the integration has access to,
 * walks each page's block children, flattens supported block types into
 * a Markdown-ish string, and upserts with `sourceType: "notion"`.
 */

import { Client as NotionClient } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PartialBlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
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

export interface NotionSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
}

function extractTextFromRichText(richText: RichTextItemResponse[]): string {
  return richText.map((item) => item.plain_text).join("");
}

function isFullBlock(
  block: BlockObjectResponse | PartialBlockObjectResponse,
): block is BlockObjectResponse {
  return "type" in block;
}

function extractBlockText(block: BlockObjectResponse): string {
  const type = block.type;

  switch (type) {
    case "paragraph":
      return extractTextFromRichText(block.paragraph.rich_text);
    case "heading_1":
      return `# ${extractTextFromRichText(block.heading_1.rich_text)}`;
    case "heading_2":
      return `## ${extractTextFromRichText(block.heading_2.rich_text)}`;
    case "heading_3":
      return `### ${extractTextFromRichText(block.heading_3.rich_text)}`;
    case "bulleted_list_item":
      return `• ${extractTextFromRichText(block.bulleted_list_item.rich_text)}`;
    case "numbered_list_item":
      return extractTextFromRichText(block.numbered_list_item.rich_text);
    case "quote":
      return `> ${extractTextFromRichText(block.quote.rich_text)}`;
    case "code":
      return `\`\`\`\n${extractTextFromRichText(block.code.rich_text)}\n\`\`\``;
    case "toggle":
      return extractTextFromRichText(block.toggle.rich_text);
    case "callout":
      return extractTextFromRichText(block.callout.rich_text);
    case "to_do":
      const checked = block.to_do.checked ? "[x]" : "[ ]";
      return `${checked} ${extractTextFromRichText(block.to_do.rich_text)}`;
    default:
      return "";
  }
}

export async function runNotionSync(
  ctx: ActionCtx,
  args: NotionSyncArgs,
): Promise<{ synced: number }> {
  const { driver, profileId, openRouterAuth } = await setupSync(
    ctx,
    args.clerkId,
  );

  try {
    const notion = new NotionClient({ auth: args.accessToken });

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

      for (const page of pages) {
        if (page.object !== "page") continue;

        try {
          let title = "Untitled";
          if ("properties" in page) {
            const titleProp = Object.values(page.properties).find(
              (p) => p.type === "title",
            );
            if (titleProp && titleProp.type === "title") {
              title = extractTextFromRichText(titleProp.title) || "Untitled";
            }
          }

          const blocks: string[] = [];
          let blockCursor: string | undefined;

          do {
            const blocksResponse = await notion.blocks.children.list({
              block_id: page.id,
              page_size: 100,
              start_cursor: blockCursor,
            });

            for (const block of blocksResponse.results) {
              if (isFullBlock(block)) {
                const text = extractBlockText(block);
                if (text) blocks.push(text);
              }
            }

            blockCursor = blocksResponse.has_more
              ? (blocksResponse.next_cursor ?? undefined)
              : undefined;
          } while (blockCursor);

          const content = blocks.join("\n\n").slice(0, 50000);
          const pageUrl =
            "url" in page
              ? page.url
              : `https://notion.so/${page.id.replace(/-/g, "")}`;

          const embedding = await embedSyncedDoc(
            ctx,
            openRouterAuth,
            profileId,
            title,
            content,
          );

          await upsertFromSource(driver, {
            userId: args.clerkId,
            profileId,
            title,
            content,
            sourceType: "notion",
            sourceId: page.id,
            sourceUrl: pageUrl,
            embedding,
          });

          totalSynced++;
          await maybeReportProgress(ctx, {
            connectorId: args.connectorId,
            totalSynced,
            totalFound,
          });
        } catch (pageErr) {
          console.error(`Failed to sync page ${page.id}:`, pageErr);
          // Continue with other pages
        }
      }

      startCursor = searchResponse.has_more
        ? (searchResponse.next_cursor ?? undefined)
        : undefined;
    } while (startCursor);

    await markSyncComplete(ctx, {
      connectorId: args.connectorId,
      totalSynced,
    });

    return { synced: totalSynced };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Notion sync failed";
    console.error("Notion sync error:", err);
    await markSyncError(ctx, {
      connectorId: args.connectorId,
      errorMessage,
    });
    throw err;
  }
}
