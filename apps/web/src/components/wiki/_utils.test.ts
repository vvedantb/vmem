import { describe, expect, it } from "vitest";
import {
  buildTree,
  compareWikiTreeSiblings,
  resolveWikiMove,
  WIKI_ROOT_DROP_ID,
} from "./_utils";
import type { Doc, Id } from "@vmem/backend";
import { optimisticId } from "@/lib/optimisticId";

/** Stable branded wiki id for tests (`optimisticId` requires UUID-shaped strings). */
function testWikiId(suffix: string): Id<"wikiNodes"> {
  const tail = suffix.padEnd(12, "0").slice(0, 12);
  return optimisticId("wikiNodes", `00000000-0000-4000-8000-${tail}`);
}

function wikiNode(
  id: Id<"wikiNodes">,
  title: string,
  kind: "folder" | "document",
  parentId?: Id<"wikiNodes">,
  order = 0,
): Doc<"wikiNodes"> {
  return {
    _id: id,
    _creationTime: 0,
    userId: optimisticId("users", "00000000-0000-4000-8000-000000000001"),
    parentId,
    kind,
    title,
    order,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("compareWikiTreeSiblings", () => {
  it("sorts folders before documents", () => {
    const folder = wikiNode(testWikiId("f1"), "Zebra", "folder");
    const doc = wikiNode(testWikiId("d1"), "Alpha", "document");
    expect(compareWikiTreeSiblings(folder, doc)).toBeLessThan(0);
    expect(compareWikiTreeSiblings(doc, folder)).toBeGreaterThan(0);
  });

  it("sorts titles A–Z within the same kind", () => {
    const a = wikiNode(testWikiId("a0"), "Alpha", "document");
    const b = wikiNode(testWikiId("b0"), "Beta", "document");
    expect(compareWikiTreeSiblings(a, b)).toBeLessThan(0);
  });
});

describe("buildTree", () => {
  it("orders siblings folders first then documents, each A–Z", () => {
    const nodes: Doc<"wikiNodes">[] = [
      wikiNode(testWikiId("d2"), "Zulu doc", "document", undefined, 0),
      wikiNode(testWikiId("f2"), "Beta folder", "folder", undefined, 1),
      wikiNode(testWikiId("d1"), "Alpha doc", "document", undefined, 2),
      wikiNode(testWikiId("f1"), "Alpha folder", "folder", undefined, 3),
    ];
    const titles = buildTree(nodes).map((item) => item.node.title);
    expect(titles).toEqual([
      "Alpha folder",
      "Beta folder",
      "Alpha doc",
      "Zulu doc",
    ]);
  });

  it("applies the same sort inside folders", () => {
    const parent = testWikiId("parent00");
    const nodes: Doc<"wikiNodes">[] = [
      wikiNode(parent, "Parent", "folder"),
      wikiNode(testWikiId("c2"), "zebra", "document", parent),
      wikiNode(testWikiId("c1"), "mango", "folder", parent),
      wikiNode(testWikiId("c3"), "apple", "document", parent),
    ];
    const childTitles = buildTree(nodes)[0].children.map(
      (item) => item.node.title,
    );
    expect(childTitles).toEqual(["mango", "apple", "zebra"]);
  });
});

/** Plain-string node fixture; `resolveWikiMove` is generic over the id type. */
interface TestNode {
  _id: string;
  parentId?: string;
  kind: "folder" | "document";
  order: number;
}

// folder-a (0)
//   doc-1 (0)
//   folder-b (1)
//     doc-2 (0)
// doc-3 (1)   [root]
const nodes: TestNode[] = [
  { _id: "folder-a", kind: "folder", order: 0 },
  { _id: "doc-1", parentId: "folder-a", kind: "document", order: 0 },
  { _id: "folder-b", parentId: "folder-a", kind: "folder", order: 1 },
  { _id: "doc-2", parentId: "folder-b", kind: "document", order: 0 },
  { _id: "doc-3", kind: "document", order: 1 },
];

describe("resolveWikiMove", () => {
  it("moves a document into a folder, appended after existing children", () => {
    expect(resolveWikiMove(nodes, "doc-3", "folder-a")).toEqual({
      id: "doc-3",
      newParentId: "folder-a",
      newOrder: 2, // after doc-1 (0) and folder-b (1)
    });
  });

  it("moves a node into an empty folder at order 0", () => {
    expect(resolveWikiMove(nodes, "doc-3", "folder-b")).toEqual({
      id: "doc-3",
      newParentId: "folder-b",
      newOrder: 1, // after doc-2 (0)
    });
  });

  it("moves a node to the root level", () => {
    expect(resolveWikiMove(nodes, "doc-1", WIKI_ROOT_DROP_ID)).toEqual({
      id: "doc-1",
      newParentId: undefined,
      newOrder: 2, // after folder-a (0) and doc-3 (1)
    });
  });

  it("ignores a drop onto the node itself", () => {
    expect(resolveWikiMove(nodes, "folder-a", "folder-a")).toBeNull();
  });

  it("ignores a drop into the node's current parent (no-op)", () => {
    expect(resolveWikiMove(nodes, "doc-1", "folder-a")).toBeNull();
  });

  it("ignores a root drop for a node already at root", () => {
    expect(resolveWikiMove(nodes, "doc-3", WIKI_ROOT_DROP_ID)).toBeNull();
  });

  it("blocks dropping a folder into its own descendant", () => {
    expect(resolveWikiMove(nodes, "folder-a", "folder-b")).toBeNull();
  });

  it("ignores a drop onto a document (not a folder)", () => {
    expect(resolveWikiMove(nodes, "doc-1", "doc-3")).toBeNull();
  });

  it("ignores an undefined drop target", () => {
    expect(resolveWikiMove(nodes, "doc-1", undefined)).toBeNull();
  });
});
