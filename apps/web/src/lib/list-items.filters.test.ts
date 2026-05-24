import { describe, expect, it } from "vitest";
import type { ListItem } from "./list-items";
import {
  listItemMatchesKindFilter,
  listItemMatchesProfileFilter,
  listItemMatchesSourceFilter,
  listItemMatchesTagFilter,
  listItemMatchesTypeFilter,
} from "./list-items";
import type { Memory } from "./memories";
import {
  memoryMatchesProfileFilter,
  memoryMatchesSourceFilters,
  memoryMatchesTagFilters,
  memoryMatchesTypeFilters,
} from "./memories";

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

const sampleMemory: Memory = {
  id: "mem-1",
  title: "Memory",
  content: "Body",
  type: "episodic",
  source: "browser-extension",
  sourceUrl: null,
  sourceSyncedAt: null,
  tags: ["react"],
  createdAt: "2026-01-01T00:00:00.000Z",
  profileId: "profile-a",
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

  it("filters memories by profile while leaving other kinds visible", () => {
    expect(listItemMatchesProfileFilter(memoryItem, "profile-a")).toBe(true);
    expect(listItemMatchesProfileFilter(memoryItem, "profile-b")).toBe(false);
    expect(listItemMatchesProfileFilter(wikiDoc, "profile-b")).toBe(true);
    expect(listItemMatchesProfileFilter(memoryItem, null)).toBe(true);
  });
});

describe("memory filters", () => {
  it("passes all memories when no filters are selected", () => {
    expect(memoryMatchesTagFilters(sampleMemory, [])).toBe(true);
    expect(memoryMatchesSourceFilters(sampleMemory, [])).toBe(true);
    expect(memoryMatchesTypeFilters(sampleMemory, [])).toBe(true);
    expect(memoryMatchesProfileFilter(sampleMemory, null)).toBe(true);
  });

  it("matches tags case-insensitively with AND semantics", () => {
    expect(memoryMatchesTagFilters(sampleMemory, ["REACT"])).toBe(true);
    expect(memoryMatchesTagFilters(sampleMemory, ["react", "missing"])).toBe(
      false,
    );
  });

  it("matches source, type, and profile filters", () => {
    expect(
      memoryMatchesSourceFilters(sampleMemory, ["browser-extension"]),
    ).toBe(true);
    expect(memoryMatchesSourceFilters(sampleMemory, ["web"])).toBe(false);
    expect(memoryMatchesTypeFilters(sampleMemory, ["episodic"])).toBe(true);
    expect(memoryMatchesTypeFilters(sampleMemory, ["knowledge"])).toBe(false);
    expect(memoryMatchesProfileFilter(sampleMemory, "profile-a")).toBe(true);
    expect(memoryMatchesProfileFilter(sampleMemory, "profile-b")).toBe(false);
  });
});
