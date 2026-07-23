import type { CreateMemoryParams } from "@/types/api";
import { base64 as base64Codec } from "@scure/base";
import { createMemory, retrieveMemories, saveScreenshot } from "./api-client";
import { importBookmarks } from "./import-bookmarks";
import { importHistory } from "./import-history";
import { cancelImport } from "./import-cancel";
import { runAutoSyncNow } from "./sync-scheduler";
import { lastBookmarkSyncItem, lastHistorySyncItem } from "@/lib/storage";
import { onMessage, type SaveOutcome } from "@/lib/messaging";
import { htmlToMarkdown } from "@/lib/page-extraction";

async function createMemoryOrThrow(
  params: CreateMemoryParams,
): Promise<SaveOutcome> {
  const memory = await createMemory(params);
  return { memoryId: memory.id };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

// decode base64 png payload without utf 8 mangling binary bytes
function base64PngToBlob(base64: string): Blob {
  const decoded = base64Codec.decode(base64);
  const bytes = new Uint8Array(decoded.length);
  bytes.set(decoded);
  return new Blob([bytes], { type: "image/png" });
}

export function registerMessageHandler(): void {
  onMessage("retrieveMemories", async ({ data }) => {
    try {
      return await retrieveMemories(data.query);
    } catch {
      return [];
    }
  });

  onMessage("savePage", async ({ data }) => {
    // convert html to markdown if provided otherwise use plain content
    const contentToSave = data.markdown
      ? htmlToMarkdown(data.markdown)
      : data.content;
    return createMemoryOrThrow({
      title: data.title,
      content: contentToSave.slice(0, 10000),
      type: "knowledge",
      source: "browser-extension",
      tags: [new URL(data.url).hostname],
      confidence: 1.0,
      url: data.url,
      profileId: data.profileId,
    });
  });

  onMessage("saveYoutubeVideo", async ({ data }) => {
    const content = `Channel: ${data.channel}\n\nTranscript:\n${data.transcript}`;
    return createMemoryOrThrow({
      title: data.title,
      content: content.slice(0, 10000),
      type: "knowledge",
      source: "youtube",
      tags: ["youtube", data.channel],
      confidence: 1.0,
      url: data.url,
      profileId: data.profileId,
    });
  });

  onMessage("capturePrompt", async ({ data }) => {
    const trimmed = data.prompt.trim();
    const title = trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
    return createMemoryOrThrow({
      title,
      content: data.prompt.slice(0, 10000),
      type: "knowledge",
      source: "prompt-capture",
      tags: [new URL(data.url).hostname, data.platform, "prompt"],
      confidence: 0.8,
      url: data.url,
      profileId: data.profileId,
    });
  });

  onMessage("saveSelection", async ({ data }) => {
    const trimmed = data.selectedText.trim();
    const title = trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
    const hostname = new URL(data.pageUrl).hostname;

    console.log("[vmem] Saving selection:", {
      title,
      hostname,
      textLength: data.selectedText.length,
    });

    try {
      return await createMemoryOrThrow({
        title,
        content: data.selectedText.slice(0, 10000),
        type: "knowledge",
        source: "browser-extension",
        tags: [hostname, "selection"],
        confidence: 1.0,
        url: data.pageUrl,
        profileId: data.profileId,
      });
    } catch (err) {
      console.error("[vmem] SAVE_SELECTION failed:", errorMessage(err));
      throw err;
    }
  });

  onMessage("captureVisibleTab", async () => {
    try {
      // omitting windowId targets the currently focused window which
      // is the one the user is interacting with when they triggered
      // the screenshot shortcut
      const dataUrl = await chrome.tabs.captureVisibleTab({
        format: "png",
      });
      return { dataUrl };
    } catch (err) {
      console.error("[vmem] CAPTURE_VISIBLE_TAB failed:", errorMessage(err));
      throw err;
    }
  });

  onMessage("saveScreenshot", async ({ data }) => {
    try {
      const blob = base64PngToBlob(data.base64Png);
      const memory = await saveScreenshot({
        blob,
        caption: data.caption,
        pageUrl: data.pageUrl,
        pageTitle: data.pageTitle,
        profileId: data.profileId,
      });
      return { memoryId: memory.id };
    } catch (err) {
      console.error("[vmem] SAVE_SCREENSHOT failed:", errorMessage(err));
      throw err;
    }
  });

  onMessage("importBookmarks", async () => {
    const result = await importBookmarks();
    return {
      count: result.imported,
      locked: result.locked,
    };
  });

  onMessage("importHistory", async ({ data }) => {
    const result = await importHistory(data.days);
    return {
      count: result.imported,
      locked: result.locked,
    };
  });

  onMessage("cancelImport", () => {
    cancelImport();
  });

  onMessage("debugRunAutoSync", async () => {
    await runAutoSyncNow();
    const [lastHistorySync, lastBookmarkSync] = await Promise.all([
      lastHistorySyncItem.getValue(),
      lastBookmarkSyncItem.getValue(),
    ]);
    return { lastHistorySync, lastBookmarkSync };
  });
}
