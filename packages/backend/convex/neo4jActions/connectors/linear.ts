"use node";

/**
 * Linear connector — pulls issues + projects via Linear's GraphQL API.
 * Issues collapse description + comments into one body; projects store
 * description + state. `fullHistory: false` (default) pulls only the
 * last 30 days; `true` walks the full history.
 */

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

export interface LinearSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
  fullHistory: boolean;
}

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

export async function runLinearSync(
  ctx: ActionCtx,
  args: LinearSyncArgs,
): Promise<{ synced: number }> {
  const { driver, profileId, openRouterAuth } = await setupSync(
    ctx,
    args.clerkId,
  );

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

          const truncatedContent = content.slice(0, 50000);
          const embedding = await embedSyncedDoc(
            ctx,
            openRouterAuth,
            profileId,
            title,
            truncatedContent,
          );

          await upsertFromSource(driver, {
            userId: args.clerkId,
            profileId,
            title,
            content: truncatedContent,
            sourceType: "linear",
            sourceId: issue.id,
            sourceUrl: issue.url,
            embedding,
          });

          totalSynced++;
          await maybeReportProgress(ctx, {
            connectorId: args.connectorId,
            totalSynced,
            totalFound,
          });
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

    // --- Projects (separate sourceType so users can filter) ---
    let projectAfter: string | null = null;
    do {
      const data: LinearProjectsData = await linearGraphQL<LinearProjectsData>(
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
          const truncatedContent = content.slice(0, 50000);
          const embedding = await embedSyncedDoc(
            ctx,
            openRouterAuth,
            profileId,
            title,
            truncatedContent,
          );

          await upsertFromSource(driver, {
            userId: args.clerkId,
            profileId,
            title,
            content: truncatedContent,
            sourceType: "linear_project",
            sourceId: project.id,
            sourceUrl: project.url,
            embedding,
          });

          totalSynced++;
          await maybeReportProgress(ctx, {
            connectorId: args.connectorId,
            totalSynced,
            totalFound,
          });
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

    await markSyncComplete(ctx, {
      connectorId: args.connectorId,
      totalSynced,
    });

    return { synced: totalSynced };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Linear sync failed";
    console.error("Linear sync error:", err);
    await markSyncError(ctx, {
      connectorId: args.connectorId,
      errorMessage,
    });
    throw err;
  }
}
