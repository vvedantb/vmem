import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

describe("dashboard stats loading", () => {
  it("keeps a skeleton while Convex auth or the stats action is still pending", () => {
    const source = read("Dashboard.tsx");
    expect(source).toContain("statsQuery.isPending");
    expect(source).not.toContain("statsQuery.isLoading");
    expect(source).not.toMatch(/if \(!stats\) \{\s*return null;/);
  });

  it("does not count dashboard cards up from zero on remount", () => {
    expect(read("DashboardStatCards.tsx")).toContain("animateOnView={false}");
    expect(read("../icons/animations/AnimatedCounter.tsx")).toContain(
      "useSpring(animateOnView ? 0 : value",
    );
  });
});
