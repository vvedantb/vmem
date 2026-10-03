import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "PageContainer.tsx"), "utf8");

describe("PageContainer title row", () => {
  it("keeps a stable min-height whether or not rightSection is present", () => {
    const row = source.slice(source.indexOf("data-page-header-row"));
    const rowClasses = row.slice(0, row.indexOf(")}"));
    // unconditional at every breakpoint, not gated on hasHeaderRight
    expect(rowClasses).toMatch(/"relative items-center[^"]*(?<!:)\bmin-h-10\b/);
    // the right slot uses the same height so both states line up
    expect(source).toMatch(/className="flex min-h-10[^"]*justify-self-end"/);
  });
});
