import { describe, expect, it } from "vitest";
import type { ListItem } from "./list-items";
import {
  listItemMatchesKindFilter,
  listItemMatchesSourceFilter,
  listItemMatchesTagFilter,
  listItemMatchesTypeFilter,
} from "./list-items";

const memoryItem: ListItem = {
  kind: "memory",
  id: "mem-1",
  title: "Memory",
  content: "Body",
  tags: ["React", "TypeScript"],
  createdAt: "2026-01-01T00:00:00.000Z",
  type: "knowledge",
  source: "web",
  sourceUrl: null,
  sourceSyncedAt: null,
  profileId: "profile-a",
};

const wikiDoc: ListItem = {
  kind: "wiki-document",
  id: "wiki:doc-1",
  wikiId: "doc-1",
  title: "Wiki page",
  content: "Notes",
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("list item filters", () => {
  it("passes all items when no kind filter is selected", () => {
    expect(listItemMatchesKindFilter(memoryItem, [])).toBe(true);
    expect(listItemMatchesKindFilter(wikiDoc, [])).toBe(true);
  });

  it("filters by selected kinds only", () => {
    expect(listItemMatchesKindFilter(memoryItem, ["memory"])).toBe(true);
    expect(listItemMatchesKindFilter(wikiDoc, ["memory"])).toBe(false);
    expect(listItemMatchesKindFilter(wikiDoc, ["wiki-document"])).toBe(true);
  });

  it("requires every selected tag on memories and ignores non-memory items", () => {
    expect(listItemMatchesTagFilter(memoryItem, [])).toBe(true);
    expect(listItemMatchesTagFilter(memoryItem, ["react"])).toBe(true);
    expect(listItemMatchesTagFilter(memoryItem, ["react", "typescript"])).toBe(
      true,
    );
    expect(listItemMatchesTagFilter(memoryItem, ["graphql"])).toBe(false);
    expect(listItemMatchesTagFilter(wikiDoc, ["graphql"])).toBe(true);
  });

  it("filters memory sources without hiding wiki items", () => {
    expect(listItemMatchesSourceFilter(memoryItem, ["web"])).toBe(true);
    expect(listItemMatchesSourceFilter(memoryItem, ["mcp"])).toBe(false);
    expect(listItemMatchesSourceFilter(wikiDoc, ["mcp"])).toBe(true);
  });

  it("filters memory types without hiding wiki items", () => {
    expect(listItemMatchesTypeFilter(memoryItem, ["knowledge"])).toBe(true);
    expect(listItemMatchesTypeFilter(memoryItem, ["episodic"])).toBe(false);
    expect(listItemMatchesTypeFilter(wikiDoc, ["episodic"])).toBe(true);
  });
});
