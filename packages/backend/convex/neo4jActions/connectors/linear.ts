"use node";

/**
 * Linear connector — pulls issues + projects via Linear's GraphQL API.
 * Issues collapse description + comments into one body; projects store
 * description + state. `fullHistory: false` (default) pulls only the
 * last 30 days; `true` walks the full history.
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

export interface LinearSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
  fullHistory: boolean;
}

const linearEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

const linearCommentSchema = z.object({
  body: z.string(),
  createdAt: z.string(),
  user: z.object({ name: z.string() }).nullable(),
});

const linearIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  updatedAt: z.string(),
  comments: z.object({ nodes: z.array(linearCommentSchema) }),
  project: z.object({ id: z.string() }).nullable(),
});

const linearProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  updatedAt: z.string(),
  state: z.string(),
});

const linearPageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const linearIssuesDataSchema = z.object({
  issues: z.object({
    nodes: z.array(linearIssueSchema),
    pageInfo: linearPageInfoSchema,
  }),
});

const linearProjectsDataSchema = z.object({
  projects: z.object({
    nodes: z.array(linearProjectSchema),
    pageInfo: linearPageInfoSchema,
  }),
});

type LinearIssuesData = z.infer<typeof linearIssuesDataSchema>;
type LinearProjectsData = z.infer<typeof linearProjectsDataSchema>;

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

async function linearGraphQL<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  dataSchema: z.ZodType<T, z.ZodTypeDef, unknown>,
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
  const envelope = await parseResponseJson(res, linearEnvelopeSchema);
  if (envelope.errors && envelope.errors.length > 0) {
    throw new Error(
      `Linear GraphQL error: ${envelope.errors.map((e) => e.message).join(", ")}`,
    );
  }
  if (envelope.data === undefined) {
    throw new Error("Linear GraphQL returned no data");
  }
  const dataParsed = dataSchema.safeParse(envelope.data);
  if (!dataParsed.success) {
    throw new Error(
      `Linear GraphQL data validation failed: ${dataParsed.error.message}`,
    );
  }
  return dataParsed.data;
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
  const setup = await setupSync(ctx, args.clerkId);

  const filterDate = args.fullHistory
    ? null
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const issueFilter = filterDate
    ? { updatedAt: { gte: filterDate } }
    : undefined;
  const projectFilter = filterDate
    ? { updatedAt: { gte: filterDate } }
    : undefined;

  return withConnectorSyncError(ctx, args.connectorId, "Linear", async () => {
    let totalSynced = 0;
    let totalFound = 0;

    // --- Issues ---
    let after: string | null = null;
    do {
      const data: LinearIssuesData = await linearGraphQL(
        args.accessToken,
        LINEAR_ISSUES_QUERY,
        { after, filter: issueFilter },
        linearIssuesDataSchema,
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

          totalSynced = await upsertSyncedDoc(ctx, {
            setup,
            clerkId: args.clerkId,
            totalSynced,
            doc: {
              title,
              content,
              sourceType: "linear",
              sourceId: issue.id,
              sourceUrl: issue.url,
            },
          });
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
      const data: LinearProjectsData = await linearGraphQL(
        args.accessToken,
        LINEAR_PROJECTS_QUERY,
        { after: projectAfter, filter: projectFilter },
        linearProjectsDataSchema,
      );

      const projects = data.projects.nodes;
      totalFound += projects.length;

      for (const project of projects) {
        try {
          const title = `Project: ${project.name}`;
          const description = project.description ?? "";
          const content = `${description}\nState: ${project.state}`;
          totalSynced = await upsertSyncedDoc(ctx, {
            setup,
            clerkId: args.clerkId,
            totalSynced,
            doc: {
              title,
              content,
              sourceType: "linear_project",
              sourceId: project.id,
              sourceUrl: project.url,
            },
          });
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
      clerkId: args.clerkId,
      totalSynced,
    });

    return { synced: totalSynced };
  });
}
