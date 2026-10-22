import { describe, expect, it } from "vitest";
import {
  awaitsNextDream,
  listItemToMemory,
  memoryToListItem,
  visitCountLabel,
} from "./list-items";
import { formatMemorySourceLabel, memoryFromSummary } from "./memories";

const CREATED = "2026-10-20T13:07:00.000Z";

describe("memory list dream helpers", () => {
  it("shows ×N visits only above one visit", () => {
    expect(visitCountLabel(undefined)).toBeNull();
    expect(visitCountLabel(1)).toBeNull();
    expect(visitCountLabel(6)).toBe("×6 visits");
  });

  it("marks rows created after the last successful run", () => {
    const at = Date.parse(CREATED);
    expect(awaitsNextDream(CREATED, undefined)).toBe(false);
    expect(awaitsNextDream(CREATED, null)).toBe(true);
    expect(awaitsNextDream(CREATED, at - 1)).toBe(true);
    expect(awaitsNextDream(CREATED, at + 1)).toBe(false);
  });

  it("carries visitCount from summary rows into list items and back", () => {
    const memory = memoryFromSummary({
      id: "mem_1",
      title: "vhub",
      preview: "vhub",
      type: "knowledge",
      status: "active",
      source: "browsing-history",
      sourceUrl: null,
      sourceSyncedAt: null,
      tags: [],
      createdAt: CREATED,
      updatedAt: CREATED,
      profileId: null,
      visitCount: 6,
    });
    const item = memoryToListItem(memory);
    expect(item).toMatchObject({ kind: "memory", visitCount: 6 });
    if (item.kind !== "memory") throw new Error("not a memory");
    expect(listItemToMemory(item).visitCount).toBe(6);
  });

  it("labels browsing history and bookmarks", () => {
    expect(formatMemorySourceLabel("browsing-history")).toBe(
      "Browsing history",
    );
    expect(formatMemorySourceLabel("bookmarks")).toBe("Bookmarks");
  });
});
