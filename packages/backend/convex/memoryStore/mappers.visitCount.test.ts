/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { toMemorySummary, toMemoryWithTags } from "./mappers";

const modules = import.meta.glob("../**/*.ts");
const AT = Date.parse("2026-10-20T03:00:00Z");

describe("memory mappers visitCount", () => {
  it("carries visitCount only above 1 (list ×N visits)", async () => {
    const t = convexTest(schema, modules);
    const [seen, once] = await t.run(async (ctx) => {
      const rows = [];
      for (const visitCount of [4, 1]) {
        const id = await ctx.db.insert("memories", {
          memoryId: `mem_${String(visitCount)}`,
          userId: "clerk_1",
          title: "vhub",
          content: "vhub",
          type: "knowledge",
          source: "browsing-history",
          confidence: 1,
          status: "active",
          tags: [],
          createdAt: AT,
          updatedAt: AT,
          contentHash: "h",
          visitCount,
          firstVisitAt: AT,
          lastVisitAt: AT,
        });
        rows.push(await ctx.db.get(id));
      }
      return rows;
    });
    if (!seen || !once) throw new Error("rows missing");
    expect(toMemorySummary(seen).visitCount).toBe(4);
    expect(toMemoryWithTags(seen).visitCount).toBe(4);
    expect("visitCount" in toMemorySummary(once)).toBe(false);
    expect("visitCount" in toMemoryWithTags(once)).toBe(false);
  });
});
