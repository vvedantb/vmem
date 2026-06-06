import { describe, expect, it } from "vitest";
import {
  escapeLuceneQuery,
  toMemoryContentFulltextQuery,
} from "../../engine/neo4j/luceneQuery";

describe("escapeLuceneQuery", () => {
  it("escapes leading slash and other Lucene operators", () => {
    const input = "/debrief command meaning workflow";
    expect(escapeLuceneQuery(input)).toBe(
      "\\/debrief command meaning workflow",
    );
  });

  it("escapes colons and parentheses", () => {
    expect(escapeLuceneQuery("foo:bar (baz)")).toBe("foo\\:bar \\(baz\\)");
  });
});

describe("toMemoryContentFulltextQuery", () => {
  it("returns null for blank input", () => {
    expect(toMemoryContentFulltextQuery("   ")).toBeNull();
  });

  it("returns escaped query for slash-prefixed commands", () => {
    expect(toMemoryContentFulltextQuery("/debrief workflow")).toBe(
      "\\/debrief workflow",
    );
  });
});
