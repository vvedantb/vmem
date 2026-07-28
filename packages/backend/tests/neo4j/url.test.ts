// AI-generated (Claude), prompt: "unit tests for url normalize tracking param strip and casing"
// Modified by me: removed fragments and trailing path slashes
import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../../engine/neo4j/url";

describe("normalizeUrl", () => {
  it("treats the same page with different tracking params as one URL", () => {
    const withUtm = normalizeUrl(
      "https://Example.com/post?utm_source=newsletter&id=1",
    );
    const withGclid = normalizeUrl(
      "https://example.com/post?id=1&gclid=abc123",
    );

    expect(withUtm).not.toBeNull();
    expect(withGclid).not.toBeNull();
    expect(withUtm).toBe(withGclid);
  });

  it("returns null for strings that are not valid URLs", () => {
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });

  it("normalizes protocol and hostname casing", () => {
    expect(normalizeUrl("http://EXAMPLE.com/Path")).toBe(
      "https://example.com/Path",
    );
  });

  it("removes URL fragments", () => {
    expect(normalizeUrl("https://example.com/docs#section-2")).toBe(
      "https://example.com/docs",
    );
  });

  it("removes trailing slashes from the path", () => {
    expect(normalizeUrl("https://example.com/foo/")).toBe(
      "https://example.com/foo",
    );
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("strips common tracking query parameters while keeping content params", () => {
    expect(
      normalizeUrl(
        "https://example.com/article?utm_campaign=spring&topic=neo4j&ref=twitter",
      ),
    ).toBe("https://example.com/article?topic=neo4j");
  });

  it("preserves non-tracking query parameters", () => {
    expect(normalizeUrl("https://example.com/search?q=memory&page=2")).toBe(
      "https://example.com/search?q=memory&page=2",
    );
  });
});
