"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { google } from "googleapis";
import { Client as NotionClient } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PartialBlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";

// --- Google Drive Sync ---

export const syncGoogleDriveInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());

    // Get or create default profile for synced content
    const defaultProfile = await ctx.runMutation(
      internal.profiles.getOrCreateDefaultByClerkIdInternal,
      { clerkId: args.clerkId },
    );
    const profileId = defaultProfile._id;

    try {
      // Setup Google Drive client
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: args.accessToken });
      const drive = google.drive({ version: "v3", auth });

      // List Google Docs, Sheets, Slides
      const mimeTypes = [
        "application/vnd.google-apps.document",
        "application/vnd.google-apps.spreadsheet",
        "application/vnd.google-apps.presentation",
      ];

      let pageToken: string | undefined;
      let totalSynced = 0;
      let totalFound = 0;

      do {
        const listResponse = await drive.files.list({
          q: mimeTypes.map((t) => `mimeType='${t}'`).join(" or "),
          fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
          pageSize: 100,
          pageToken,
        });

        const files = listResponse.data.files ?? [];
        totalFound += files.length;

        for (const file of files) {
          if (!file.id || !file.name) continue;

          try {
            // Export as plain text
            const exportResponse = await drive.files.export({
              fileId: file.id,
              mimeType: "text/plain",
            });

            const content =
              typeof exportResponse.data === "string"
                ? exportResponse.data
                : String(exportResponse.data);

            // Upsert to Neo4j
            await service.upsertFromSource({
              userId: args.clerkId,
              profileId,
              title: file.name,
              content: content.slice(0, 50000), // Limit content size
              sourceType: "google_drive",
              sourceId: file.id,
              sourceUrl:
                file.webViewLink ??
                `https://drive.google.com/file/d/${file.id}`,
            });

            totalSynced++;

            // Update progress every 10 items
            if (totalSynced % 10 === 0) {
              const progress = Math.min(
                99,
                Math.round(
                  (totalSynced / Math.max(totalFound, totalSynced)) * 100,
                ),
              );
              await ctx.runMutation(
                internal.connectors.updateSyncProgressInternal,
                {
                  id: args.connectorId,
                  syncProgress: progress,
                  itemsSynced: totalSynced,
                },
              );
            }
          } catch (fileErr) {
            console.error(`Failed to sync file ${file.name}:`, fileErr);
            // Continue with other files
          }
        }

        pageToken = listResponse.data.nextPageToken ?? undefined;
      } while (pageToken);

      // Mark complete
      await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
        id: args.connectorId,
        syncStatus: "idle",
        syncProgress: 100,
        itemsSynced: totalSynced,
        lastSyncAt: Date.now(),
      });

      return { synced: totalSynced };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Google Drive sync failed";
      console.error("Google Drive sync error:", err);

      await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
        id: args.connectorId,
        syncStatus: "error",
        errorMessage,
      });

      throw err;
    }
  },
});

// --- Notion Sync ---

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

export const syncNotionInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const memoryService = new MemoryService(getDriver());

    // Get or create default profile for synced content
    const defaultProfile = await ctx.runMutation(
      internal.profiles.getOrCreateDefaultByClerkIdInternal,
      { clerkId: args.clerkId },
    );
    const profileId = defaultProfile._id;

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
            // Get page title
            let title = "Untitled";
            if ("properties" in page) {
              const titleProp = Object.values(page.properties).find(
                (p) => p.type === "title",
              );
              if (titleProp && titleProp.type === "title") {
                title = extractTextFromRichText(titleProp.title) || "Untitled";
              }
            }

            // Get page content (blocks)
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

            const content = blocks.join("\n\n").slice(0, 50000); // Limit content size
            const pageUrl =
              "url" in page
                ? page.url
                : `https://notion.so/${page.id.replace(/-/g, "")}`;

            // Upsert to Neo4j
            await memoryService.upsertFromSource({
              userId: args.clerkId,
              profileId,
              title,
              content,
              sourceType: "notion",
              sourceId: page.id,
              sourceUrl: pageUrl,
            });

            totalSynced++;

            // Update progress every 10 items
            if (totalSynced % 10 === 0) {
              const progress = Math.min(
                99,
                Math.round(
                  (totalSynced / Math.max(totalFound, totalSynced)) * 100,
                ),
              );
              await ctx.runMutation(
                internal.connectors.updateSyncProgressInternal,
                {
                  id: args.connectorId,
                  syncProgress: progress,
                  itemsSynced: totalSynced,
                },
              );
            }
          } catch (pageErr) {
            console.error(`Failed to sync page ${page.id}:`, pageErr);
            // Continue with other pages
          }
        }

        startCursor = searchResponse.has_more
          ? (searchResponse.next_cursor ?? undefined)
          : undefined;
      } while (startCursor);

      // Mark complete
      await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
        id: args.connectorId,
        syncStatus: "idle",
        syncProgress: 100,
        itemsSynced: totalSynced,
        lastSyncAt: Date.now(),
      });

      return { synced: totalSynced };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Notion sync failed";
      console.error("Notion sync error:", err);

      await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
        id: args.connectorId,
        syncStatus: "error",
        errorMessage,
      });

      throw err;
    }
  },
});
