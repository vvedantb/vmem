import { describe, expect, it } from "vitest";
import { browseKey } from "@vmem/shared";
import {
  browseGateParts,
  browseUrlOf,
  isLowValueBrowseUrl,
  isSearchRefinement,
  searchPageOf,
} from "../../engine/memory/browseGate";

const POST = "https://www.instagram.com/p/DeteNVUiIVE/";

describe("browseGateParts", () => {
  it("keys Instagram img_index and utm variants by one canonical url", () => {
    const keys = new Set(
      [
        `${POST}?utm_source=ig_embed&img_index=2`,
        `${POST}?img_index=3`,
        `${POST}?igsh=abc#comments`,
        POST,
      ].map((url) => browseGateParts({ url, title: "Instagram" }).key),
    );
    expect([...keys]).toEqual(["url|https://instagram.com/p/DeteNVUiIVE"]);
  });

  it("treats site-name titles as generic and keeps them in the content", () => {
    const parts = browseGateParts({ url: POST, title: "(3) Instagram" });
    expect(parts.title).toBe("Instagram");
    expect(parts.content).toBe(
      "Instagram\nhttps://instagram.com/p/DeteNVUiIVE",
    );
    for (const title of ["YouTube", "Home / X"]) {
      expect(
        browseGateParts({ url: "https://x.com/a/status/1", title }).key,
      ).toBe("url|https://x.com/a/status/1");
    }
  });

  it("keeps the browseKey v1 key for real titles", () => {
    const entry = {
      url: "https://www.google.com/search?q=red+fish&ei=1&ved=2",
      title: "red fish - Google Search",
    };
    const parts = browseGateParts(entry);
    expect(parts.key).toBe(browseKey(entry));
    expect(parts.title).toBe("red fish - Google Search");
    expect(parts.content).toBe("red fish - Google Search\ngoogle.com");
  });

  it("uses the canonical url as title and content without a real title", () => {
    const parts = browseGateParts({
      url: "https://example.com/a/?utm_source=x#top",
    });
    expect(parts.title).toBe("https://example.com/a");
    expect(parts.content).toBe("https://example.com/a");
  });
});

describe("browseUrlOf", () => {
  it("reads the url line of old extension content", () => {
    expect(
      browseUrlOf({
        content: `Instagram\n${POST}?img_index=2\nVisited 1 times`,
      }),
    ).toBe(`${POST}?img_index=2`);
    expect(browseUrlOf({ url: " https://a.b/ ", content: "x" })).toBe(
      "https://a.b/",
    );
    expect(browseUrlOf({ content: "no url" })).toBeUndefined();
  });
});

describe("isLowValueBrowseUrl", () => {
  it.each([
    "https://www.instagram.com/",
    "https://x.com/home",
    "https://twitter.com/home?lang=en",
    "https://x.com/",
    "https://www.reddit.com/",
    "https://www.youtube.com/",
    "https://www.youtube.com/feed/subscriptions",
    "https://www.facebook.com/",
    "https://www.linkedin.com/feed/",
    "chrome://newtab/",
    "about:blank",
    "https://github.com/login",
    "https://example.com/signin?next=/",
    "https://www.instagram.com/accounts/login/",
    "https://accounts.google.com/v3/signin/identifier",
  ])("skips %s", (url) => {
    expect(isLowValueBrowseUrl(url)).toBe(true);
  });

  it.each([
    POST,
    "https://x.com/someone/status/1",
    "https://www.youtube.com/watch?v=abc",
    "https://www.google.com/search?q=red+fish",
    "https://docs.convex.dev/auth/clerk",
    "https://www.reddit.com/r/typescript/",
  ])("keeps %s", (url) => {
    expect(isLowValueBrowseUrl(url)).toBe(false);
  });

  it("takes a custom page list", () => {
    expect(
      isLowValueBrowseUrl("https://news.ycombinator.com/", [
        "news.ycombinator.com/",
      ]),
    ).toBe(true);
  });
});

describe("search refinement", () => {
  it("parses google, bing and duckduckgo queries", () => {
    expect(
      searchPageOf("https://www.google.co.uk/search?q=Red++Fish&ei=x"),
    ).toEqual({ engine: "google.co.uk", query: "red fish" });
    expect(searchPageOf("https://www.bing.com/search?q=a")).toEqual({
      engine: "bing.com",
      query: "a",
    });
    expect(searchPageOf("https://duckduckgo.com/?q=a+b")).toEqual({
      engine: "duckduckgo.com",
      query: "a b",
    });
    expect(searchPageOf("https://www.google.com/maps?q=a")).toBeNull();
    expect(searchPageOf("https://www.google.com/search")).toBeNull();
  });

  it("accepts identical, prefix and word-superset queries on one engine", () => {
    const at = (query: string, engine = "google.com") => ({ engine, query });
    expect(isSearchRefinement(at("red fish"), at("red fish"))).toBe(true);
    expect(isSearchRefinement(at("red fi"), at("red fish"))).toBe(true);
    expect(isSearchRefinement(at("red fish"), at("red fish dish"))).toBe(true);
    expect(isSearchRefinement(at("red fish"), at("fish red curry"))).toBe(true);
    expect(isSearchRefinement(at("red fish dish"), at("red fish"))).toBe(false);
    expect(isSearchRefinement(at("red fish"), at("blue fish"))).toBe(false);
    expect(
      isSearchRefinement(at("red fish"), at("red fish dish", "bing.com")),
    ).toBe(false);
  });
});
