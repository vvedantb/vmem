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

// --- OneDrive Sync ---

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

export const syncOneDriveInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());

    const defaultProfile = await ctx.runMutation(
      internal.profiles.getOrCreateDefaultByClerkIdInternal,
      { clerkId: args.clerkId },
    );
    const profileId = defaultProfile._id;

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

            await service.upsertFromSource({
              userId: args.clerkId,
              profileId,
              title: item.name,
              content: text.slice(0, 50000),
              sourceType: "onedrive",
              sourceId: item.id,
              sourceUrl:
                item.webUrl ??
                `https://onedrive.live.com/?id=${encodeURIComponent(item.id)}`,
            });

            totalSynced++;

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
          } catch (itemErr) {
            console.error(
              `Failed to sync OneDrive item ${item.name}:`,
              itemErr,
            );
            // Continue with other files
          }
        }

        nextUrl = listData["@odata.nextLink"] ?? null;
      }

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
        err instanceof Error ? err.message : "OneDrive sync failed";
      console.error("OneDrive sync error:", err);

      await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
        id: args.connectorId,
        syncStatus: "error",
        errorMessage,
      });

      throw err;
    }
  },
});

// --- Linear Sync ---

interface LinearComment {
  body: string;
  createdAt: string;
  user: { name: string } | null;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  updatedAt: string;
  comments: { nodes: LinearComment[] };
  project: { id: string } | null;
}

interface LinearProject {
  id: string;
  name: string;
  description: string | null;
  url: string;
  updatedAt: string;
  state: string;
}

interface LinearPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface LinearIssuesData {
  issues: {
    nodes: LinearIssue[];
    pageInfo: LinearPageInfo;
  };
}

interface LinearProjectsData {
  projects: {
    nodes: LinearProject[];
    pageInfo: LinearPageInfo;
  };
}

interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

async function linearGraphQL<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
  }
  const body: LinearGraphQLResponse<T> = await res.json();
  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `Linear GraphQL error: ${body.errors.map((e) => e.message).join(", ")}`,
    );
  }
  if (!body.data) {
    throw new Error("Linear GraphQL returned no data");
  }
  return body.data;
}

const LINEAR_ISSUES_QUERY = `
  query Issues($after: String, $filter: IssueFilter) {
    issues(first: 50, after: $after, filter: $filter) {
      nodes {
        id
        identifier
        title
        description
        url
        updatedAt
        comments(first: 50) {
          nodes {
            body
            createdAt
            user { name }
          }
        }
        project { id }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const LINEAR_PROJECTS_QUERY = `
  query Projects($after: String, $filter: ProjectFilter) {
    projects(first: 50, after: $after, filter: $filter) {
      nodes {
        id
        name
        description
        url
        updatedAt
        state
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const syncLinearInternal = internalAction({
  args: {
    clerkId: v.string(),
    connectorId: v.id("connectors"),
    accessToken: v.string(),
    // When false (default), only pull issues + projects updated in the last 30 days.
    // When true, pull the full history (used by the "Sync all history" menu item).
    fullHistory: v.boolean(),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());

    const defaultProfile = await ctx.runMutation(
      internal.profiles.getOrCreateDefaultByClerkIdInternal,
      { clerkId: args.clerkId },
    );
    const profileId = defaultProfile._id;

    const filterDate = args.fullHistory
      ? null
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const issueFilter = filterDate
      ? { updatedAt: { gte: filterDate } }
      : undefined;
    const projectFilter = filterDate
      ? { updatedAt: { gte: filterDate } }
      : undefined;

    try {
      let totalSynced = 0;
      let totalFound = 0;

      // --- Issues ---
      let after: string | null = null;
      do {
        const data: LinearIssuesData = await linearGraphQL<LinearIssuesData>(
          args.accessToken,
          LINEAR_ISSUES_QUERY,
          { after, filter: issueFilter },
        );

        const issues = data.issues.nodes;
        totalFound += issues.length;

        for (const issue of issues) {
          try {
            const title = `${issue.identifier} ${issue.title}`;
            const description = issue.description ?? "";
            const comments = issue.comments.nodes;

            let content = description;
            if (comments.length > 0) {
              const commentsBlock = comments
                .map((c) => `[${c.user?.name ?? "Unknown"}] ${c.body}`)
                .join("\n\n");
              content = content
                ? `${content}\n\n---\nComments:\n${commentsBlock}`
                : `---\nComments:\n${commentsBlock}`;
            }
            // Empty-issue fallback: use title as content so the issue still
            // shows up as a browseable memory.
            if (!content.trim()) {
              content = title;
            }

            await service.upsertFromSource({
              userId: args.clerkId,
              profileId,
              title,
              content: content.slice(0, 50000),
              sourceType: "linear",
              sourceId: issue.id,
              sourceUrl: issue.url,
            });

            totalSynced++;

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
          } catch (issueErr) {
            console.error(
              `Failed to sync Linear issue ${issue.identifier}:`,
              issueErr,
            );
          }
        }

        after = data.issues.pageInfo.hasNextPage
          ? data.issues.pageInfo.endCursor
          : null;
      } while (after);

      // --- Projects (stored as a separate sourceType so users can filter) ---
      let projectAfter: string | null = null;
      do {
        const data: LinearProjectsData =
          await linearGraphQL<LinearProjectsData>(
            args.accessToken,
            LINEAR_PROJECTS_QUERY,
            { after: projectAfter, filter: projectFilter },
          );

        const projects = data.projects.nodes;
        totalFound += projects.length;

        for (const project of projects) {
          try {
            const title = `Project: ${project.name}`;
            const description = project.description ?? "";
            const content = `${description}\nState: ${project.state}`;

            await service.upsertFromSource({
              userId: args.clerkId,
              profileId,
              title,
              content: content.slice(0, 50000),
              sourceType: "linear_project",
              sourceId: project.id,
              sourceUrl: project.url,
            });

            totalSynced++;

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
          } catch (projErr) {
            console.error(
              `Failed to sync Linear project ${project.name}:`,
              projErr,
            );
          }
        }

        projectAfter = data.projects.pageInfo.hasNextPage
          ? data.projects.pageInfo.endCursor
          : null;
      } while (projectAfter);

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
        err instanceof Error ? err.message : "Linear sync failed";
      console.error("Linear sync error:", err);

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
