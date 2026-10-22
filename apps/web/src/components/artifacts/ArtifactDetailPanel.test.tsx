import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

// query results by function name; "skip" args read as loading
const results = new Map<string, object | null>();

vi.mock("@vmem/backend", () => ({
  api: {
    artifacts: {
      api: Object.fromEntries(
        [
          "get",
          "history",
          "refs",
          "getVersion",
          "getState",
          "putState",
          "restoreVersion",
          "update",
          "remove",
          "restore",
        ].map((name) => [name, name]),
      ),
    },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (name: string, args: object | "skip") =>
    args === "skip" ? undefined : results.get(name),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

const { ArtifactDetailPanel } = await import("./ArtifactDetailPanel");

const detail = {
  id: "a1",
  title: "Week 3 quiz",
  type: "document",
  format: "html",
  currentVersion: 2,
  version: 2,
  size: 20,
  origin: { client: "mcp" },
  createdAt: 1,
  updatedAt: 2,
  body: "<p>hello</p>",
};

function render() {
  return renderToStaticMarkup(
    <NuqsTestingAdapter>
      <ArtifactDetailPanel profileId="p1" artifactId="a1" />
    </NuqsTestingAdapter>,
  );
}

describe("ArtifactDetailPanel", () => {
  beforeEach(() => results.clear());

  it("shows not found when the artifact is gone or unreadable", () => {
    results.set("get", null);
    expect(render()).toContain("Artifact not found");
  });

  it("renders the body in a sandboxed frame, never inline", () => {
    results.set("get", detail);
    results.set("history", []);
    results.set("refs", []);
    const html = render();
    expect(html).toContain("Week 3 quiz");
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("<p>hello</p>");
    expect(html).not.toContain("in the trash");
    expect(html).toContain('aria-label="Delete"');
  });

  it("offers Restore for a trashed artifact and hides edits", () => {
    results.set("get", { ...detail, deletedAt: 5 });
    results.set("history", []);
    results.set("refs", []);
    const html = render();
    expect(html).toContain("This artifact is in the trash");
    expect(html).toContain("Restore");
    expect(html).not.toContain('aria-label="Delete"');
  });

  it("shows the Linked menu only when the artifact has refs", () => {
    results.set("get", detail);
    results.set("history", []);
    results.set("refs", []);
    expect(render()).not.toContain('aria-label="Linked"');
    results.set("refs", [{ kind: "memory", target: "m1", createdAt: 1 }]);
    expect(render()).toContain('aria-label="Linked"');
  });
});
