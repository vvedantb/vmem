import { describe, expect, it } from "vitest";
import type { GraphSnapshotGraph } from "@vmem/shared";
import { mergeSnapshotDelta, type GraphDelta } from "./graph-snapshot";

const CREATED = "2026-01-01T00:00:00.000Z";

function memory(id: string, title = id) {
  return {
    id,
    title,
    tags: [],
    createdAt: CREATED,
    kind: "memory" as const,
    source: "api",
    sourceType: null,
    type: "knowledge" as const,
  };
}

const snapshot: GraphSnapshotGraph = {
  nodes: [
    memory("mem-a"),
    memory("mem-b"),
    {
      id: "entity:only-a",
      title: "Only A",
      tags: [],
      createdAt: CREATED,
      kind: "entity",
      sourceType: null,
      entityType: "person",
    },
    {
      id: "entity:shared",
      title: "Shared",
      tags: [],
      createdAt: CREATED,
      kind: "entity",
      sourceType: null,
      entityType: "project",
    },
    {
      id: "skill:old",
      title: "Old skill",
      tags: [],
      createdAt: CREATED,
      kind: "skill",
      sourceType: null,
      content: "old",
    },
  ],
  relatesToEdges: [{ source: "mem-a", target: "mem-b", reason: "similar" }],
  mentionsEdges: [
    { source: "mem-a", target: "entity:only-a" },
    { source: "mem-a", target: "entity:shared" },
    { source: "mem-b", target: "entity:shared" },
  ],
};

const emptyDelta: GraphDelta = {
  needsRefresh: false,
  memories: [],
  links: [],
  deletedMemoryIds: [],
  skills: [],
};

describe("mergeSnapshotDelta", () => {
  it("shows the snapshot as is without a delta", () => {
    const merged = mergeSnapshotDelta(snapshot, undefined);
    expect(merged.nodes.map((node) => node.id)).toEqual(
      snapshot.nodes.map((node) => node.id),
    );
    expect(merged.relatesToEdges).toEqual(snapshot.relatesToEdges);
  });

  it("drops deleted memories, their edges and entities only they mention", () => {
    const merged = mergeSnapshotDelta(snapshot, {
      ...emptyDelta,
      deletedMemoryIds: ["mem-a"],
    });
    expect(merged.nodes.map((node) => node.id)).toEqual([
      "mem-b",
      "entity:shared",
    ]);
    expect(merged.relatesToEdges).toEqual([]);
    expect(merged.mentionsEdges).toEqual([
      { source: "mem-b", target: "entity:shared" },
    ]);
  });

  it("adds new memories and links, replaces changed ones and the skill list", () => {
    const merged = mergeSnapshotDelta(snapshot, {
      ...emptyDelta,
      memories: [memory("mem-b", "renamed"), memory("mem-c")],
      links: [
        { source: "mem-b", target: "mem-c", reason: "new" },
        { source: "mem-a", target: "mem-b", reason: "similar" },
      ],
      skills: [
        {
          id: "skill:new",
          title: "New skill",
          tags: [],
          createdAt: CREATED,
          kind: "skill",
          sourceType: null,
          content: "new",
        },
      ],
    });
    expect(merged.nodes.map((node) => node.id)).toEqual([
      "mem-a",
      "mem-b",
      "entity:only-a",
      "entity:shared",
      "mem-c",
      "skill:new",
    ]);
    expect(merged.nodes.find((node) => node.id === "mem-b")?.title).toBe(
      "renamed",
    );
    expect(merged.relatesToEdges).toEqual([
      { source: "mem-a", target: "mem-b", reason: "similar" },
      { source: "mem-b", target: "mem-c", reason: "new" },
    ]);
  });

  it("ignores a delta that asks for a refresh", () => {
    const merged = mergeSnapshotDelta(snapshot, {
      ...emptyDelta,
      needsRefresh: true,
    });
    expect(merged.nodes).toHaveLength(snapshot.nodes.length);
  });
});
