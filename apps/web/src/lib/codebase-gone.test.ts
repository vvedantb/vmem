import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webSrc = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("codebase graph product surface is gone", () => {
  it("generated routes do not include /codebases pages", () => {
    const tree = readFileSync(join(webSrc, "routeTree.gen.ts"), "utf8");
    expect(tree.toLowerCase()).not.toContain("codebase");
  });

  it("sidebar nav does not advertise codebases", () => {
    const nav = readFileSync(
      join(webSrc, "components/sidebar/nav-config.ts"),
      "utf8",
    );
    expect(nav.toLowerCase()).not.toContain("codebase");
  });

  it("memory graph types have no code-symbol kinds or codebase-only edges", () => {
    const types = readFileSync(join(webSrc, "lib/graph/types.ts"), "utf8");
    expect(types).not.toMatch(/code-file|code-function|code-class/);
    expect(types).not.toMatch(
      /"imports"|"calls"|"has_method"|"starts_process"/,
    );
  });
});
