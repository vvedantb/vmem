import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  EMBED_CONTENT_CAP,
  mapSyncedDocs,
  runPaginatedConnectorSync,
  type ConnectorPage,
  type SyncedDoc,
} from "./syncShared";

export interface GitHubSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
}

const GITHUB_API_BASE = "https://api.github.com";
export const GITHUB_MAX_ITEMS = 300;
const GITHUB_PAGE_SIZE = 100;
const GITHUB_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

const githubIssueListSchema = z.array(z.unknown());

const githubIssueSchema = z.object({
  node_id: z.string(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().optional(),
  state: z.string(),
  html_url: z.string(),
  updated_at: z.string().optional(),
  user: z.object({ login: z.string() }).nullable().optional(),
  labels: z
    .array(z.union([z.string(), z.object({ name: z.string().optional() })]))
    .optional(),
  repository: z.object({ full_name: z.string() }).optional(),
  pull_request: z.object({}).optional(),
});

type GitHubIssue = z.infer<typeof githubIssueSchema>;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function repoFromHtmlUrl(htmlUrl: string): string {
  const match = /github\.com\/([^/]+\/[^/]+)\//.exec(htmlUrl);
  return match?.[1] ?? "unknown";
}

function labelNames(issue: GitHubIssue): string[] {
  return (issue.labels ?? [])
    .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
    .filter((name) => name.length > 0);
}

export function githubIssueToDoc(raw: unknown): SyncedDoc {
  const issue = githubIssueSchema.parse(raw);
  const repo = issue.repository?.full_name ?? repoFromHtmlUrl(issue.html_url);
  const kind = issue.pull_request ? "Pull request" : "Issue";
  const labels = labelNames(issue);

  const lines = [
    `${kind} ${repo}#${issue.number}: ${issue.title}`,
    `Repository: ${repo}`,
    `State: ${issue.state}`,
  ];
  if (issue.user) lines.push(`Author: ${issue.user.login}`);
  if (labels.length > 0) lines.push(`Labels: ${labels.join(", ")}`);
  if (issue.updated_at) lines.push(`Updated: ${issue.updated_at}`);
  const body = issue.body?.trim() ?? "";
  if (body) lines.push("", body);

  return {
    title: `${repo}#${issue.number}: ${issue.title}`,
    content: lines.join("\n").slice(0, EMBED_CONTENT_CAP),
    sourceType: "github",
    sourceId: issue.node_id,
    sourceUrl: issue.html_url,
  };
}

function hasNextPage(linkHeader: string | null): boolean {
  return linkHeader?.includes('rel="next"') ?? false;
}

// issues the user can see across owned, member and org repos, prs included
export function githubIssuesUrl(page: number, since: Date): string {
  const params = new URLSearchParams({
    filter: "all",
    state: "all",
    sort: "updated",
    direction: "desc",
    since: since.toISOString(),
    per_page: String(GITHUB_PAGE_SIZE),
    page: String(page),
  });
  return `${GITHUB_API_BASE}/issues?${params.toString()}`;
}

export function createGitHubPageFetcher(
  accessToken: string,
  options: { fetchImpl?: FetchLike; now?: number } = {},
): (cursor: string | undefined) => Promise<ConnectorPage> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const since = new Date((options.now ?? Date.now()) - GITHUB_LOOKBACK_MS);
  let listed = 0;

  return async (cursor) => {
    const page = cursor ? Number(cursor) : 1;
    const response = await fetchImpl(githubIssuesUrl(page, since), {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "vmem-connector",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub issues request failed with ${response.status}`);
    }

    const items = githubIssueListSchema
      .parse(await response.json())
      .slice(0, GITHUB_MAX_ITEMS - listed);
    listed += items.length;

    const docs = await mapSyncedDocs(items, {
      label: "issue",
      identify: (item) => {
        const parsed = githubIssueSchema.safeParse(item);
        return parsed.success ? parsed.data.html_url : "unknown";
      },
      toDoc: async (item) => githubIssueToDoc(item),
    });

    const more =
      hasNextPage(response.headers.get("link")) && listed < GITHUB_MAX_ITEMS;
    return {
      docs,
      found: items.length,
      nextCursor: more ? String(page + 1) : undefined,
    };
  };
}

export async function runGitHubSync(
  ctx: ActionCtx,
  args: GitHubSyncArgs,
): Promise<{ synced: number }> {
  return runPaginatedConnectorSync(ctx, {
    clerkId: args.clerkId,
    connectorId: args.connectorId,
    label: "GitHub",
    fetchPage: createGitHubPageFetcher(args.accessToken),
  });
}
