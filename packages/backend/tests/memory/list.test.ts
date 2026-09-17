import { describe, expect, it } from "vitest";
import {
  memoryMatchesListFilter,
  pageMemoryList,
  type MemoryListable,
} from "../../engine/memory/list";

function memory(overrides: Partial<MemoryListable> = {}): MemoryListable {
  return {
    type: "knowledge",
    status: "active",
    source: "api",
    tags: ["alpha"],
    title: "Prefers pnpm",
    content: "Use pnpm in the vmem monorepo",
    ...overrides,
  };
}

describe("memoryMatchesListFilter", () => {
  it("hides suppressed rows unless status is requested", () => {
    expect(memoryMatchesListFilter(memory({ status: "suppressed" }), {})).toBe(
      false,
    );
    expect(
      memoryMatchesListFilter(memory({ status: "suppressed" }), {
        status: "suppressed",
      }),
    ).toBe(true);
  });

  it("requires every filter tag and matches type/source/search", () => {
    const row = memory({
      type: "profile",
      source: "manual",
      tags: ["pnpm", "tooling"],
    });

    expect(
      memoryMatchesListFilter(row, {
        type: "profile",
        source: "manual",
        tags: ["pnpm", "tooling"],
        searchQuery: "PNPM",
      }),
    ).toBe(true);
    expect(memoryMatchesListFilter(row, { tags: ["pnpm", "missing"] })).toBe(
      false,
    );
    expect(memoryMatchesListFilter(row, { tags: ["PNPM"] })).toBe(true);
    expect(memoryMatchesListFilter(row, { type: " profile " })).toBe(true);
    expect(memoryMatchesListFilter(row, { type: "episodic" })).toBe(false);
    expect(memoryMatchesListFilter(row, { searchQuery: "webpack" })).toBe(
      false,
    );
    expect(
      memoryMatchesListFilter(row, { searchQuery: "package manager" }),
    ).toBe(true);
    expect(memoryMatchesListFilter(row, { searchQuery: "what is the" })).toBe(
      false,
    );
    expect(memoryMatchesListFilter(row, { searchQuery: "🔥" })).toBe(false);
  });

  it("matches unicode words that ASCII tokenization would drop", () => {
    const row = memory({
      title: "Prefers green tea",
      content: "المستخدم يحب الشاي الأخضر",
      tags: ["tea"],
    });
    expect(memoryMatchesListFilter(row, { searchQuery: "أين الشاي" })).toBe(
      true,
    );
    expect(memoryMatchesListFilter(row, { searchQuery: "你好" })).toBe(false);
  });
});

describe("pageMemoryList", () => {
  it("slices by offset and limit", () => {
    expect(pageMemoryList(["a", "b", "c"], 2, 1)).toEqual(["b", "c"]);
    expect(pageMemoryList(["a", "b"], 0, 0)).toEqual([]);
  });
});
