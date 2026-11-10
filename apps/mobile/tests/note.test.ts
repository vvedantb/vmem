import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clipboardItem, noteItem } from "../src/capture/note";
import { buildPromotion } from "../src/capture/promote";
import { redactSecrets } from "../src/capture/redact";
import { shareItem, withShareNote } from "../src/capture/share";
import { structuredStoreBodySchema } from "@vmem/sdk";
import {
  bodyOf,
  byNumber,
  INSTALL,
  MIN,
  share,
  T0,
  textEvent,
} from "./helpers";

const options = { collectedThroughMs: T0 + 61 * MIN, installId: INSTALL };

describe("note and clipboard items", () => {
  it("labels the source and uses a content-hash externalId", () => {
    const note = noteItem(textEvent("note", "Call the vet\nabout Max"));
    assert.ok(note);
    assert.equal(note.kind, "note");
    assert.match(note.externalId, /^android:note:[0-9a-f]{14}$/);
    assert.equal(bodyOf(note).source, "android-note");
    assert.equal(bodyOf(note).title, "Note: Call the vet");
    const same = noteItem(textEvent("note", "Call the vet\nabout Max", 5));
    assert.equal(same?.externalId, note.externalId);

    const clip = clipboardItem(textEvent("clipboard", "https://example.com"));
    assert.ok(clip);
    assert.match(clip.externalId, /^android:clipboard:/);
    assert.equal(bodyOf(clip).source, "android-clipboard");
  });

  it("rejects empty text and the wrong kind", () => {
    assert.equal(noteItem(textEvent("note", "  \n ")), null);
    assert.equal(clipboardItem(textEvent("clipboard", "")), null);
    assert.equal(noteItem(textEvent("clipboard", "x")), null);
  });
});

describe("buildPromotion with intentional captures", () => {
  it("combines share, note and clipboard and drains all of them", () => {
    const events = [
      share("https://example.com"),
      textEvent("note", "idea"),
      textEvent("clipboard", "copied text"),
      textEvent("note", " "),
    ];
    const promotion = buildPromotion(events, options);
    assert.deepEqual(
      promotion.items.map((item) => item.kind),
      ["share", "note", "clipboard"],
    );
    assert.deepEqual(
      promotion.deleteEventIds.sort(byNumber),
      events.map((event) => event.id).sort(byNumber),
    );
    assert.deepEqual(promotion.trimEvents, []);
  });
});

describe("withShareNote", () => {
  it("adds the note to content and keeps title, source and externalId", () => {
    const item = shareItem(share("https://example.com", { subject: "Cool" }));
    assert.ok(item);
    const before = bodyOf(item);
    const after = structuredStoreBodySchema.parse(
      JSON.parse(withShareNote(before, "  for the trip  ")),
    );
    assert.ok(after.content.startsWith(before.content));
    assert.ok(after.content.endsWith("Your note: for the trip"));
    assert.equal(after.title, before.title);
    assert.equal(after.source, "android-share");
    assert.equal(after.externalId, before.externalId);
    assert.deepEqual(
      structuredStoreBodySchema.parse(JSON.parse(withShareNote(before, " "))),
      before,
    );
  });
});

describe("redactSecrets", () => {
  it("removes keys, tokens and one-time codes and keeps other text", () => {
    assert.equal(
      redactSecrets(
        "key vmem_sk_abc123DEF and sk-proj-abcdefghijklmnop1234 ok",
      ),
      "key [redacted] and [redacted] ok",
    );
    assert.equal(
      redactSecrets("Your verification code is 482913. Do not share."),
      "Your verification code is [redacted]. Do not share.",
    );
    assert.equal(redactSecrets("123 456"), "[redacted]");
    assert.equal(
      redactSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwx"),
      "Authorization: [redacted]",
    );
    assert.equal(
      redactSecrets("Meet at 10:30, room 42"),
      "Meet at 10:30, room 42",
    );
  });
});
