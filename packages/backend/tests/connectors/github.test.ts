import { describe, expect, it, vi } from "vitest";
import {
  createGitHubPageFetcher,
  GITHUB_MAX_ITEMS,
  githubIssueToDoc,
} from "../../convex/connectors/github";
import { runPaginatedConnectorSync } from "../../convex/connectors/syncShared";
import {
  createFakeSyncCtx,
  docIds,
  jsonResponse,
  TEST_CLERK_ID,
  TEST_CONNECTOR_ID,
} from "./helpers";

const NOW = Date.parse("2026-10-01T00:00:00Z");

function issue(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: n,
    node_id: `I_node${n}`,
    number: n,
    title: `Issue ${n}`,
    body: `Body ${n}`,
    state: "open",
    html_url: `https://github.com/acme/app/issues/${n}`,
    updated_at: "2026-09-30T00:00:00Z",
    user: { login: "octocat" },
    labels: [{ name: "bug" }],
    repository: { full_name: "acme/app" },
    ...overrides,
  };
}

function fakeGitHubFetch(pages: unknown[][]) {
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    urls.push(url);
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer gho_test");
    expect(headers.get("User-Agent")).toBeTruthy();
    const page = Number(url.searchParams.get("page"));
    const hasNext = page < pages.length;
    return jsonResponse(pages[page - 1] ?? [], {
      headers: hasNext
        ? {
            Link: `<https://api.github.com/issues?page=${page + 1}>; rel="next"`,
          }
        : {},
    });
  });
  return { fetchImpl, urls };
}

describe("githubIssueToDoc", () => {
  it("maps an issue with repo, state, labels, and body", () => {
    const doc = githubIssueToDoc(issue(7));
    expect(doc).toMatchObject({
      title: "acme/app#7: Issue 7",
      sourceType: "github",
      sourceId: "I_node7",
      sourceUrl: "https://github.com/acme/app/issues/7",
    });
    expect(doc.content).toContain("Issue acme/app#7: Issue 7");
    expect(doc.content).toContain("State: open");
    expect(doc.content).toContain("Author: octocat");
    expect(doc.content).toContain("Labels: bug");
    expect(doc.content).toContain("Body 7");
  });

  it("labels pull requests and derives the repo from the url", () => {
    const doc = githubIssueToDoc(
      issue(9, {
        repository: undefined,
        pull_request: { url: "x" },
        html_url: "https://github.com/acme/api/pull/9",
        body: null,
      }),
    );
    expect(doc.title).toBe("acme/api#9: Issue 9");
    expect(doc.content).toContain("Pull request acme/api#9");
  });

  it("throws on malformed items so mapSyncedDocs can skip them", () => {
    expect(() => githubIssueToDoc({ title: "no ids" })).toThrow();
  });
});

describe("createGitHubPageFetcher", () => {
  it("requests recently updated issues and follows the link header", async () => {
    const { fetchImpl, urls } = fakeGitHubFetch([
      [issue(1), issue(2)],
      [issue(3)],
    ]);
    const fetchPage = createGitHubPageFetcher("gho_test", {
      fetchImpl,
      now: NOW,
    });

    const first = await fetchPage(undefined);
    expect(docIds(first.docs)).toEqual(["I_node1", "I_node2"]);
    expect(first.nextCursor).toBe("2");
    expect(urls[0]?.pathname).toBe("/issues");
    expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toMatchObject({
      filter: "all",
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: "100",
      page: "1",
      since: "2026-07-03T00:00:00.000Z",
    });

    const second = await fetchPage(first.nextCursor);
    expect(docIds(second.docs)).toEqual(["I_node3"]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("stops at the item cap", async () => {
    const pages = Array.from({ length: 5 }, (_, p) =>
      Array.from({ length: 100 }, (_, i) => issue(p * 100 + i)),
    );
    const { fetchImpl, urls } = fakeGitHubFetch(pages);
    const fetchPage = createGitHubPageFetcher("gho_test", {
      fetchImpl,
      now: NOW,
    });

    let cursor: string | undefined;
    let total = 0;
    do {
      const page = await fetchPage(cursor);
      total += page.docs.length;
      cursor = page.nextCursor;
    } while (cursor);

    expect(total).toBe(GITHUB_MAX_ITEMS);
    expect(urls).toHaveLength(GITHUB_MAX_ITEMS / 100);
  });

  it("keeps the rest of the page when one item is malformed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetchImpl } = fakeGitHubFetch([
      [issue(1), { title: "broken" }, issue(3)],
    ]);
    const page = await createGitHubPageFetcher("gho_test", {
      fetchImpl,
      now: NOW,
    })(undefined);
    expect(docIds(page.docs)).toEqual(["I_node1", "I_node3"]);
    expect(page.found).toBe(3);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to sync issue unknown"),
    );
    errorSpy.mockRestore();
  });

  it("fails the sync on a non-ok listing response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: "Bad credentials" }, { status: 401 }),
    );
    await expect(
      createGitHubPageFetcher("gho_test", { fetchImpl, now: NOW })(undefined),
    ).rejects.toThrow(/401/);
  });
});

describe("github sync through runPaginatedConnectorSync", () => {
  it("upserts github memories keyed by node id", async () => {
    const { fetchImpl } = fakeGitHubFetch([[issue(1)], [issue(2)]]);
    const fake = createFakeSyncCtx();

    const result = await runPaginatedConnectorSync(fake.ctx, {
      clerkId: TEST_CLERK_ID,
      connectorId: TEST_CONNECTOR_ID,
      label: "GitHub",
      fetchPage: createGitHubPageFetcher("gho_test", { fetchImpl, now: NOW }),
    });

    expect(result).toEqual({ synced: 2 });
    expect(fake.upserted()).toEqual([
      expect.objectContaining({
        sourceType: "github",
        sourceId: "I_node1",
        sourceUrl: "https://github.com/acme/app/issues/1",
      }),
      expect.objectContaining({ sourceType: "github", sourceId: "I_node2" }),
    ]);
  });
});
