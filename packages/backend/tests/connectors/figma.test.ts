import { describe, expect, it, vi } from "vitest";
import {
  createFigmaApi,
  createFigmaPageFetcher,
  discoverFigmaFiles,
  FIGMA_MAX_FILES,
  figmaFileToDoc,
  parseFigmaTeamIds,
} from "../../convex/connectors/figma";
import { runPaginatedConnectorSync } from "../../convex/connectors/syncShared";
import {
  createFakeSyncCtx,
  docIds,
  jsonResponse,
  TEST_CLERK_ID,
  TEST_CONNECTOR_ID,
} from "./helpers";

type Route = (path: string) => Response | undefined;

function fakeFigmaFetch(route: Route) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const path = `${url.pathname}${url.search}`;
    calls.push(path);
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer figma-token",
    );
    return route(path) ?? jsonResponse({ err: "not found" }, { status: 404 });
  });
  return { api: createFigmaApi("figma-token", fetchImpl), calls };
}

function fileResponse(name: string, pages: string[]): Response {
  return jsonResponse({
    name,
    lastModified: "2026-09-30T10:00:00Z",
    document: { children: pages.map((p) => ({ name: p, type: "CANVAS" })) },
  });
}

const standardRoutes: Route = (path) => {
  switch (path) {
    case "/v1/me":
      return jsonResponse({ id: "u1", handle: "Ada", img_url: "" });
    case "/v2/teams/team1/folders":
      return jsonResponse({
        name: "Design",
        folders: [{ id: "f1", name: "Web", parent_folder_id: null }],
      });
    case "/v2/folders/f1/files":
      return jsonResponse({
        name: "Web",
        files: [
          { key: "OLD", name: "Old", last_modified: "2026-01-01T00:00:00Z" },
          { key: "NEW", name: "New", last_modified: "2026-09-01T00:00:00Z" },
        ],
      });
    case "/v1/files/NEW?depth=1":
      return fileResponse("New", ["Cover", "Checkout"]);
    case "/v1/files/OLD?depth=1":
      return fileResponse("Old", ["Archive"]);
    case "/v1/files/NEW/comments?as_md=true":
      return jsonResponse({
        comments: [
          {
            id: "c1",
            message: "Tighten spacing",
            user: { handle: "Grace" },
            created_at: "2026-09-02T00:00:00Z",
            resolved_at: null,
          },
          {
            id: "c2",
            parent_id: "c1",
            message: "Done",
            user: { handle: "Ada" },
            resolved_at: "2026-09-03T00:00:00Z",
          },
        ],
      });
    case "/v1/files/OLD/comments?as_md=true":
      return jsonResponse({ comments: [] });
    default:
      return undefined;
  }
};

describe("parseFigmaTeamIds", () => {
  it("splits and trims comma separated ids", () => {
    expect(parseFigmaTeamIds(" 1, 2 ,,3 ")).toEqual(["1", "2", "3"]);
    expect(parseFigmaTeamIds(undefined)).toEqual([]);
  });
});

describe("figmaFileToDoc", () => {
  it("includes pages and comments with a stable file key id", () => {
    const doc = figmaFileToDoc(
      { key: "KEY", name: "Listed", folderName: "Web", lastModified: "" },
      { name: "Checkout", document: { children: [{ name: "Flow" }] } },
      [
        { id: "c1", message: "Looks good", user: { handle: "Grace" } },
        { id: "c2", message: "Thanks", parent_id: "c1", resolved_at: "x" },
      ],
    );
    expect(doc).toMatchObject({
      title: "Checkout",
      sourceType: "figma",
      sourceId: "KEY",
      sourceUrl: "https://www.figma.com/file/KEY",
    });
    expect(doc.content).toContain("Folder: Web");
    expect(doc.content).toContain("- Flow");
    expect(doc.content).toContain("Grace: Looks good");
    expect(doc.content).toContain("Unknown (resolved): Thanks");
  });
});

describe("discoverFigmaFiles", () => {
  it("sorts files by last modified and skips teams it cannot list", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { api } = fakeFigmaFetch(standardRoutes);
    const files = await discoverFigmaFiles(api, ["forbidden", "team1"]);
    expect(files.map((f) => f.key)).toEqual(["NEW", "OLD"]);
    expect(files[0]?.folderName).toBe("Web");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping Figma team forbidden"),
    );
    errorSpy.mockRestore();
  });

  it("caps the number of files", async () => {
    const many = Array.from({ length: FIGMA_MAX_FILES + 5 }, (_, i) => ({
      key: `K${i}`,
      name: `File ${i}`,
    }));
    const { api } = fakeFigmaFetch((path) => {
      if (path === "/v2/teams/t/folders") {
        return jsonResponse({ folders: [{ id: "f", name: "F" }] });
      }
      if (path === "/v2/folders/f/files") return jsonResponse({ files: many });
      return undefined;
    });
    expect(await discoverFigmaFiles(api, ["t"])).toHaveLength(FIGMA_MAX_FILES);
  });
});

describe("createFigmaPageFetcher", () => {
  it("syncs file content and comments", async () => {
    const { api, calls } = fakeFigmaFetch(standardRoutes);
    const page = await createFigmaPageFetcher(api, ["team1"])(undefined);

    expect(calls[0]).toBe("/v1/me");
    expect(docIds(page.docs)).toEqual(["NEW", "OLD"]);
    expect(page.docs[0]?.content).toContain("- Checkout");
    expect(page.docs[0]?.content).toContain("Grace: Tighten spacing");
    expect(page.nextCursor).toBeUndefined();
  });

  it("paginates discovered files with an offset cursor", async () => {
    const files = Array.from({ length: 15 }, (_, i) => ({
      key: `K${String(i).padStart(2, "0")}`,
      name: `File ${i}`,
      last_modified: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const { api } = fakeFigmaFetch((path) => {
      if (path === "/v1/me") return jsonResponse({ id: "u", handle: "h" });
      if (path === "/v2/teams/t/folders") {
        return jsonResponse({ folders: [{ id: "f", name: "F" }] });
      }
      if (path === "/v2/folders/f/files") return jsonResponse({ files });
      const file = /^\/v1\/files\/(K\d+)\?depth=1$/.exec(path);
      if (file) return fileResponse(file[1] ?? "", []);
      if (path.endsWith("/comments?as_md=true")) {
        return jsonResponse({ comments: [] });
      }
      return undefined;
    });
    const fetchPage = createFigmaPageFetcher(api, ["t"]);

    const first = await fetchPage(undefined);
    expect(first.docs).toHaveLength(10);
    expect(first.nextCursor).toBe("10");
    const second = await fetchPage(first.nextCursor);
    expect(second.docs).toHaveLength(5);
    expect(second.nextCursor).toBeUndefined();
  });

  it("keeps other files when one file fails, and keeps a file when comments fail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { api } = fakeFigmaFetch((path) => {
      if (path === "/v1/files/OLD?depth=1") {
        return jsonResponse({ err: "rate limited" }, { status: 429 });
      }
      if (path === "/v1/files/NEW/comments?as_md=true") {
        return jsonResponse({ err: "forbidden" }, { status: 403 });
      }
      return standardRoutes(path);
    });

    const page = await createFigmaPageFetcher(api, ["team1"])(undefined);
    expect(docIds(page.docs)).toEqual(["NEW"]);
    expect(page.found).toBe(2);
    expect(page.docs[0]?.content).not.toContain("Comments:");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to sync file OLD"),
    );
    errorSpy.mockRestore();
  });

  it("completes with no docs when no team ids are configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { api, calls } = fakeFigmaFetch(standardRoutes);
    const page = await createFigmaPageFetcher(api, [])(undefined);
    expect(page.docs).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
    expect(calls).toEqual(["/v1/me"]);
    warnSpy.mockRestore();
  });

  it("fails the sync when the token is rejected", async () => {
    const { api } = fakeFigmaFetch(() =>
      jsonResponse({ err: "invalid token" }, { status: 403 }),
    );
    await expect(
      createFigmaPageFetcher(api, ["team1"])(undefined),
    ).rejects.toThrow(/\/v1\/me failed with 403/);
  });
});

describe("figma sync through runPaginatedConnectorSync", () => {
  it("upserts figma memories keyed by file key", async () => {
    const { api } = fakeFigmaFetch(standardRoutes);
    const fake = createFakeSyncCtx();

    const result = await runPaginatedConnectorSync(fake.ctx, {
      clerkId: TEST_CLERK_ID,
      connectorId: TEST_CONNECTOR_ID,
      label: "Figma",
      fetchPage: createFigmaPageFetcher(api, ["team1"]),
    });

    expect(result).toEqual({ synced: 2 });
    expect(fake.upserted()).toEqual([
      expect.objectContaining({
        sourceType: "figma",
        sourceId: "NEW",
        title: "New",
        sourceUrl: "https://www.figma.com/file/NEW",
      }),
      expect.objectContaining({ sourceType: "figma", sourceId: "OLD" }),
    ]);
  });
});
