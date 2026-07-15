import { describe, expect, it } from "vitest";
import type { ListItem } from "./list-items";
import { listItemPassesFilters, searchListItems } from "./list-items";
import {
  apiGraphNodePassesFilters,
  kindPassesFilter,
  sourcePassesFilter,
  tagsPassFilter,
  typePassesFilter,
} from "./memory-view-filters";
import { buildTagStats } from "./memories";

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

describe("memory view filter predicates", () => {
  it("passes all items when no kind filter is selected", () => {
    expect(kindPassesFilter(memoryItem.kind, [])).toBe(true);
    expect(kindPassesFilter(wikiDoc.kind, [])).toBe(true);
  });

  it("filters by selected kinds only", () => {
    expect(kindPassesFilter(memoryItem.kind, ["memory"])).toBe(true);
    expect(kindPassesFilter(wikiDoc.kind, ["memory"])).toBe(false);
    expect(kindPassesFilter(wikiDoc.kind, ["wiki-document"])).toBe(true);
  });

  it("requires every selected tag on memories and ignores non-memory items", () => {
    expect(tagsPassFilter(memoryItem.tags, [], memoryItem.kind)).toBe(true);
    expect(tagsPassFilter(memoryItem.tags, ["react"], memoryItem.kind)).toBe(
      true,
    );
    expect(
      tagsPassFilter(memoryItem.tags, ["react", "typescript"], memoryItem.kind),
    ).toBe(true);
    expect(tagsPassFilter(memoryItem.tags, ["graphql"], memoryItem.kind)).toBe(
      false,
    );
    expect(tagsPassFilter(wikiDoc.tags, ["graphql"], wikiDoc.kind)).toBe(true);
  });

  it("filters memory sources without hiding wiki items", () => {
    expect(
      sourcePassesFilter(memoryItem.source, ["web"], memoryItem.kind),
    ).toBe(true);
    expect(
      sourcePassesFilter(memoryItem.source, ["mcp"], memoryItem.kind),
    ).toBe(false);
    expect(sourcePassesFilter(undefined, ["mcp"], wikiDoc.kind)).toBe(true);
  });

  it("filters memory types without hiding wiki items", () => {
    expect(
      typePassesFilter(memoryItem.type, ["knowledge"], memoryItem.kind),
    ).toBe(true);
    expect(
      typePassesFilter(memoryItem.type, ["episodic"], memoryItem.kind),
    ).toBe(false);
    expect(typePassesFilter(undefined, ["episodic"], wikiDoc.kind)).toBe(true);
  });

  it("combines predicates via apiGraphNodePassesFilters", () => {
    expect(
      apiGraphNodePassesFilters(
        {
          kind: memoryItem.kind,
          tags: memoryItem.tags,
          source: memoryItem.source,
          type: memoryItem.type,
        },
        {
          kinds: ["memory"],
          tags: ["react"],
          sources: ["web"],
          types: ["knowledge"],
        },
      ),
    ).toBe(true);
    expect(
      apiGraphNodePassesFilters(
        {
          kind: memoryItem.kind,
          tags: memoryItem.tags,
          source: memoryItem.source,
          type: memoryItem.type,
        },
        {
          kinds: ["wiki-document"],
          tags: [],
          sources: [],
          types: [],
        },
      ),
    ).toBe(false);
    expect(
      apiGraphNodePassesFilters(
        { kind: wikiDoc.kind, tags: wikiDoc.tags },
        {
          kinds: [],
          tags: ["graphql"],
          sources: ["mcp"],
          types: ["episodic"],
        },
      ),
    ).toBe(true);
  });

  it("combines all filters via listItemPassesFilters", () => {
    expect(
      listItemPassesFilters(memoryItem, {
        kinds: ["memory"],
        tags: ["react"],
        sources: ["web"],
        types: ["knowledge"],
      }),
    ).toBe(true);
    expect(
      listItemPassesFilters(memoryItem, {
        kinds: ["wiki-document"],
        tags: [],
        sources: [],
        types: [],
      }),
    ).toBe(false);
    expect(
      listItemPassesFilters(wikiDoc, {
        kinds: [],
        tags: ["graphql"],
        sources: ["mcp"],
        types: ["episodic"],
      }),
    ).toBe(true);
  });
});

describe("searchListItems", () => {
  it("scores title matches above content and returns sorted results", () => {
    const wikiMatch: ListItem = {
      ...wikiDoc,
      title: "React notes",
      content: "misc",
      tags: [],
    };
    const memoryMatch: ListItem = {
      ...memoryItem,
      title: "Other",
      content: "react hooks",
      tags: [],
    };

    const results = searchListItems([wikiMatch, memoryMatch], "react");
    expect(results.map((r) => r.item.id)).toEqual(["wiki:doc-1", "mem-1"]);
    expect(results[0]?.relevanceScore).toBeGreaterThan(
      results[1]?.relevanceScore ?? 0,
    );
  });

  it("returns empty results for blank queries", () => {
    expect(searchListItems([memoryItem], "   ")).toEqual([]);
  });
});

describe("buildTagStats", () => {
  it("counts tags and tracks the latest createdAt in one pass", () => {
    const stats = buildTagStats([
      {
        id: "a",
        title: "A",
        content: "",
        type: "knowledge",
        source: "web",
        sourceUrl: null,
        sourceSyncedAt: null,
        tags: ["React", "TS"],
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "b",
        title: "B",
        content: "",
        type: "knowledge",
        source: "web",
        sourceUrl: null,
        sourceSyncedAt: null,
        tags: ["react", "GraphQL"],
        createdAt: "2026-01-03T00:00:00.000Z",
      },
    ]);

    expect(stats).toEqual(
      expect.arrayContaining([
        {
          tag: "GraphQL",
          count: 1,
          latestCreatedAt: "2026-01-03T00:00:00.000Z",
        },
        {
          tag: "React",
          count: 1,
          latestCreatedAt: "2026-01-02T00:00:00.000Z",
        },
        { tag: "TS", count: 1, latestCreatedAt: "2026-01-02T00:00:00.000Z" },
        {
          tag: "react",
          count: 1,
          latestCreatedAt: "2026-01-03T00:00:00.000Z",
        },
      ]),
    );
    expect(stats).toHaveLength(4);
  });
});
