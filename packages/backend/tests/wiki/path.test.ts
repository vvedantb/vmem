// AI-generated (Claude), prompt: "unit tests for wiki folder path normalize and resolve"
// Modified by me: resolved nested slash paths against folder fixtures
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Id } from "../../convex/_generated/dataModel";
import {
  buildWikiChildrenByParent,
  findWikiChild,
  normalizeWikiPathSegments,
  resolveWikiFolderPath,
  type WikiPathNode,
} from "../../convex/wiki/path";

function wikiId(raw: string): Id<"wikiNodes"> {
  return z.custom<Id<"wikiNodes">>((v) => typeof v === "string").parse(raw);
}

function folder(
  id: Id<"wikiNodes">,
  title: string,
  parentId: Id<"wikiNodes"> | null = null,
): WikiPathNode {
  return { id, parentId, title, kind: "folder" };
}

describe("wiki/path", () => {
  it("normalizes slash paths", () => {
    expect(normalizeWikiPathSegments("Learning")).toEqual(["Learning"]);
    expect(normalizeWikiPathSegments(" Learning / quantum ")).toEqual([
      "Learning",
      "quantum",
    ]);
    expect(normalizeWikiPathSegments("/")).toEqual([]);
  });

  it("resolves an existing folder path", () => {
    const nodes: WikiPathNode[] = [
      folder(wikiId("f1"), "Learning"),
      folder(wikiId("f2"), "quantum", wikiId("f1")),
    ];
    expect(resolveWikiFolderPath(nodes, "Learning")).toBe(wikiId("f1"));
    expect(resolveWikiFolderPath(nodes, "Learning/quantum")).toBe(wikiId("f2"));
    expect(resolveWikiFolderPath(nodes, "Missing")).toBeNull();
  });

  it("rejects paths through documents", () => {
    const nodes: WikiPathNode[] = [
      {
        id: wikiId("d1"),
        parentId: null,
        title: "Learning",
        kind: "document",
      },
    ];
    expect(resolveWikiFolderPath(nodes, "Learning")).toBeNull();
  });

  it("finds children by parent bucket", () => {
    const nodes: WikiPathNode[] = [folder(wikiId("f1"), "Learning")];
    const byParent = buildWikiChildrenByParent(nodes);
    expect(findWikiChild(byParent, null, "Learning")?.id).toBe(wikiId("f1"));
    expect(findWikiChild(byParent, null, "Other")).toBeNull();
  });
});
