// maps save/youtube/prompt/selection messages onto createMemory params
// AI-generated (Claude), prompt: "unit tests for chrome extension message handler param builders"
// Modified by me: hostname tags, truncation, markdown vs plain content
import test from "node:test";
import assert from "node:assert/strict";
import { base64 as base64Codec } from "@scure/base";
import { installChromeMock } from "./helpers/chrome-mock.mts";

installChromeMock();

const {
  savePageCreateParams,
  saveYoutubeCreateParams,
  capturePromptCreateParams,
  saveSelectionCreateParams,
  base64PngToBlob,
} = await import("../src/background/message-handler.ts");

await test("savePageCreateParams tags the hostname and prefers markdown", () => {
  const params = savePageCreateParams({
    url: "https://docs.example.com/guide",
    title: "Guide",
    content: "plain text fallback",
    markdown: "<h1>Guide</h1><p>Hello</p>",
    profileId: "p1",
  });
  assert.equal(params.type, "knowledge");
  assert.equal(params.source, "browser-extension");
  assert.deepEqual(params.tags, ["docs.example.com"]);
  assert.equal(params.profileId, "p1");
  assert.match(params.content, /Hello/);
  assert.doesNotMatch(params.content, /plain text fallback/);
});

await test("savePageCreateParams falls back to content when markdown is absent", () => {
  const params = savePageCreateParams({
    url: "https://example.com/",
    title: "Example",
    content: "visible text",
  });
  assert.equal(params.content, "visible text");
});

await test("savePageCreateParams truncates content to 10000 chars", () => {
  const params = savePageCreateParams({
    url: "https://example.com/",
    title: "Big",
    content: "x".repeat(12_000),
  });
  assert.equal(params.content.length, 10_000);
});

await test("saveYoutubeCreateParams includes channel transcript and youtube tags", () => {
  const params = saveYoutubeCreateParams({
    url: "https://www.youtube.com/watch?v=abc",
    title: "Talk",
    channel: "Vmem",
    transcript: "hello world",
  });
  assert.equal(params.source, "youtube");
  assert.deepEqual(params.tags, ["youtube", "Vmem"]);
  assert.match(params.content, /Channel: Vmem/);
  assert.match(params.content, /hello world/);
});

await test("capturePromptCreateParams ellipsizes long titles and tags the platform", () => {
  const prompt = "p".repeat(100);
  const params = capturePromptCreateParams({
    prompt,
    url: "https://chatgpt.com/c/1",
    platform: "chatgpt",
  });
  assert.equal(params.title.length, 81);
  assert.equal(params.title.endsWith("…"), true);
  assert.equal(params.source, "prompt-capture");
  assert.deepEqual(params.tags, ["chatgpt.com", "chatgpt", "prompt"]);
  assert.equal(params.confidence, 0.8);
});

await test("saveSelectionCreateParams tags hostname and selection", () => {
  const params = saveSelectionCreateParams({
    selectedText: "  highlighted  ",
    pageUrl: "https://news.example.org/story",
  });
  assert.equal(params.title, "highlighted");
  assert.deepEqual(params.tags, ["news.example.org", "selection"]);
  assert.equal(params.url, "https://news.example.org/story");
});

await test("base64PngToBlob decodes binary png bytes", () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const blob = base64PngToBlob(base64Codec.encode(bytes));
  assert.equal(blob.type, "image/png");
  assert.equal(blob.size, bytes.length);
});

const { blobToBase64 } = await import("../src/content/screenshot/capture.ts");

await test("blobToBase64 round-trips png bytes for saveScreenshot", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const blob = new Blob([bytes], { type: "image/png" });
  const encoded = await blobToBase64(blob);
  assert.equal(encoded, base64Codec.encode(bytes));
});

await test("captureVisibleTab is blocked on chrome:// and extension pages", async () => {
  await assert.rejects(
    () => chrome.tabs.captureVisibleTab({ format: "png" }),
    /Cannot capture chrome:\/\/ or extension pages/,
  );
});
