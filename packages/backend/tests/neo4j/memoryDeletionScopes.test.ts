import { describe, expect, it } from "vitest";
import { DELETION_CLEANUP_SCOPES } from "../../engine/neo4j/memory/crud";

describe("characterization: three deletion paths retain differing cleanup scopes", () => {
  it("documents which dependent nodes each deletion path removes", () => {
    expect(DELETION_CLEANUP_SCOPES.single).toEqual(["chunks"]);
    expect(DELETION_CLEANUP_SCOPES.bySourceType).toEqual([
      "chunks",
      "memoryEvents",
      "proposals",
      "orphanTagsAndSources",
    ]);
    expect(DELETION_CLEANUP_SCOPES.allForUser).toEqual([
      "chunks",
      "memoryEvents",
      "proposals",
      "entities",
      "orphanTagsAndSources",
    ]);
  });
});
