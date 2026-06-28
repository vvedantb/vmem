import { describe, expect, it } from "vitest";
import { resolveWikiMove, WIKI_ROOT_DROP_ID } from "./_utils";

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
