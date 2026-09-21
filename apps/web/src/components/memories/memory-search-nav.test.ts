import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "MemorySearch.tsx"),
  "utf8",
);

describe("MemorySearch list navigation", () => {
  it("keeps the current search string when opening or closing a memory", () => {
    const navigations = [
      ...source.matchAll(/void navigate\(\{[\s\S]*?\}\);/g),
    ].map((match) => match[0]);
    expect(navigations.length).toBeGreaterThanOrEqual(3);
    for (const navigation of navigations) {
      expect(navigation).toContain("search: true");
    }
  });
});
