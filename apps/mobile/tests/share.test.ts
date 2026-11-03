import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  firstUrl,
  shareExternalId,
  shareItem,
  shareTitle,
} from "../src/capture/share";
import { bodyOf, share } from "./helpers";

describe("shareItem", () => {
  it("keeps the text, names the source app and finds the link", () => {
    const item = shareItem(
      share("Read this later https://example.com/post?id=1.", {
        label: "Chrome",
        atMin: 2,
      }),
    );
    assert.ok(item);
    const body = bodyOf(item);
    assert.equal(body.title, "Read this later https://example.com/post?id=1.");
    assert.equal(body.url, "https://example.com/post?id=1");
    assert.match(body.content, /^Read this later/);
    assert.match(
      body.content,
      /Shared to vmem from Chrome on Android at 2026-01-05 10:02 UTC\./,
    );
    assert.deepEqual(body.tags, ["android", "share", "link"]);
    assert.equal(body.source, "android");
    assert.equal(body.type, "episodic");
    assert.equal(item.kind, "share");
  });

  it("returns null for empty text", () => {
    assert.equal(shareItem(share("   ")), null);
  });

  it("has no url field for plain text", () => {
    const item = shareItem(share("Buy milk"));
    assert.ok(item);
    assert.equal(bodyOf(item).url, undefined);
    assert.deepEqual(bodyOf(item).tags, ["android", "share"]);
  });
});

describe("shareTitle", () => {
  it("prefers the subject", () => {
    assert.equal(
      shareTitle("https://x.dev/a", "A post", "https://x.dev/a"),
      "A post",
    );
  });

  it("names a bare link", () => {
    assert.equal(
      shareTitle("https://x.dev/a/", null, "https://x.dev/a/"),
      "Shared link: x.dev/a",
    );
  });

  it("uses the first non-empty line, truncated", () => {
    const long = "a".repeat(200);
    const title = shareTitle(`\n${long}\nsecond`, null, null);
    assert.equal(title.length, 120);
    assert.ok(title.endsWith("…"));
  });
});

describe("share ids and links", () => {
  it("dedupes the same text", () => {
    assert.equal(shareExternalId("hello"), shareExternalId("hello"));
    assert.notEqual(shareExternalId("hello"), shareExternalId("hello!"));
    assert.match(shareExternalId("hello"), /^android:share:[0-9a-f]{14}$/);
  });

  it("strips trailing punctuation from a link", () => {
    assert.equal(firstUrl("see (https://a.io/x)."), "https://a.io/x");
    assert.equal(firstUrl("no link here"), null);
  });
});
