import { describe, expect, it } from "vitest";
import { browseKey, canonicalUrl } from "@vmem/shared";

const VHUB_TITLE = "vhub — your own hub for mcp connections and agent secrets";

describe("canonicalUrl", () => {
  it.each([
    [
      "drops utm_* and click ids",
      "https://example.com/a?utm_source=x&utm_medium=y&gclid=1&fbclid=2&id=7",
      "https://example.com/a?id=7",
    ],
    [
      "drops the fragment",
      "https://example.com/a#section",
      "https://example.com/a",
    ],
    [
      "drops www. and lowercases the host",
      "https://WWW.Example.COM/A",
      "https://example.com/A",
    ],
    [
      "drops a trailing slash on non-root paths",
      "https://example.com/a/",
      "https://example.com/a",
    ],
    ["keeps the root slash", "https://example.com/", "https://example.com/"],
    [
      "sorts query params",
      "https://example.com/?b=2&a=1&a=0",
      "https://example.com/?a=0&a=1&b=2",
    ],
    [
      "keeps q and drops Google noise",
      "https://www.google.com/search?q=slavic&sca_esv=abc&rlz=1C5&ei=x&ved=y&oq=slav&gs_lp=z&sclient=gws-wiz&sourceid=chrome&ie=UTF-8",
      "https://google.com/search?q=slavic",
    ],
    ["returns invalid input trimmed", "  not a url  ", "not a url"],
  ])("%s", (_label, input, expected) => {
    expect(canonicalUrl(input)).toBe(expected);
  });
});

describe("browseKey", () => {
  it.each([
    [
      "uses host + normalized title for a real title",
      { url: "https://www.example.com/a", title: "  Hello   World " },
      "example.com|hello world",
    ],
    [
      "strips a leading unread count",
      { url: "https://x.com/home", title: "(3) Home / X" },
      "x.com|home / x",
    ],
    [
      "falls back to the url key for an empty title",
      { url: "https://example.com/a?utm_source=x#top", title: "" },
      "url|https://example.com/a",
    ],
    [
      "falls back to the url key for a missing title",
      { url: "https://example.com/a" },
      "url|https://example.com/a",
    ],
    [
      "falls back to the url key when the title equals the url",
      {
        url: "https://example.com/a?ref=hn",
        title: "https://example.com/a?ref=hn",
      },
      "url|https://example.com/a",
    ],
    [
      "falls back to the url key when the title equals the host",
      { url: "https://www.example.com/a", title: "www.example.com" },
      "url|https://example.com/a",
    ],
    [
      "falls back to the url key for a bare url title",
      { url: "https://example.com/a", title: "example.com/a" },
      "url|https://example.com/a",
    ],
    [
      "keeps dotted words as real titles",
      { url: "https://nodejs.org/", title: "Node.js" },
      "nodejs.org|node.js",
    ],
  ])("%s", (_label, entry, expected) => {
    expect(browseKey(entry)).toBe(expected);
  });

  it("maps Google searches that differ only by sca_esv to one key", () => {
    const a = browseKey({
      url: "https://www.google.com/search?q=slavic&sca_esv=111",
      title: "slavic - Google Search",
    });
    const b = browseKey({
      url: "https://www.google.com/search?q=slavic&sca_esv=222",
      title: "slavic - Google Search",
    });
    expect(a).toBe(b);
    const urlA = browseKey({
      url: "https://www.google.com/search?q=slavic&sca_esv=111",
    });
    const urlB = browseKey({
      url: "https://www.google.com/search?q=slavic&sca_esv=222",
    });
    expect(urlA).toBe(urlB);
  });

  it("collapses SPA routes that share one title", () => {
    const keys = new Set(
      [
        "https://vhub.projectv.uk/",
        "https://vhub.projectv.uk/connectors",
        "https://vhub.projectv.uk/connectors?view=mine",
      ].map((url) => browseKey({ url, title: VHUB_TITLE })),
    );
    expect([...keys]).toEqual([`vhub.projectv.uk|${VHUB_TITLE}`]);
  });
});
