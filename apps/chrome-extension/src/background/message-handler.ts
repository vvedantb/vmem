import {
  contentMessageSchema,
  type ContentMessage,
  type BackgroundResponse,
} from "@/types/messages";
import type { CreateMemoryParams } from "@/types/api";
import { base64 as base64Codec } from "@scure/base";
import { createMemory, retrieveMemories, saveScreenshot } from "./api-client";
import { importBookmarks } from "./import-bookmarks";
import { importHistory } from "./import-history";
import { cancelImport } from "./import-cancel";
import { runAutoSyncNow } from "./sync-scheduler";
import { getStorage } from "@/lib/storage";
import { htmlToMarkdown } from "@/lib/page-extraction";

type SaveResult = Extract<BackgroundResponse, { type: "SAVE_RESULT" }>;

async function tryCreateMemory(
  params: CreateMemoryParams,
): Promise<SaveResult> {
  try {
    const memory = await createMemory(params);
    return { type: "SAVE_RESULT", success: true, memoryId: memory.id };
  } catch (err) {
    return {
      type: "SAVE_RESULT",
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export function registerMessageHandler(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: BackgroundResponse) => void,
    ) => {
      const parsed = contentMessageSchema.safeParse(message);
      if (!parsed.success) {
        console.log("[message-handler] Not handled, skipping");
        return false;
      }
      console.log("[message-handler] Handling:", parsed.data.type);
      void handleMessage(parsed.data).then(sendResponse);
      return true;
    },
  );
}

// decode base64 png payload without utf 8 mangling binary bytes
function base64PngToBlob(base64: string): Blob {
  const decoded = base64Codec.decode(base64);
  const bytes = new Uint8Array(decoded.length);
  bytes.set(decoded);
  return new Blob([bytes], { type: "image/png" });
}

export async function handleMessage(
  message: ContentMessage,
): Promise<BackgroundResponse> {
  await chrome.storage.local.remove("vmemSwLastMessageError");

  switch (message.type) {
    case "RETRIEVE_MEMORIES": {
      try {
        const memories = await retrieveMemories(message.query);
        return { type: "RETRIEVE_RESULT", memories };
      } catch {
        return { type: "RETRIEVE_RESULT", memories: [] };
      }
    }

    case "SAVE_PAGE": {
      // convert html to markdown if provided otherwise use plain content
      let contentToSave = message.content;
      if (message.markdown) {
        // markdown field contains html from page extraction convert it
        contentToSave = htmlToMarkdown(message.markdown);
      }
      return await tryCreateMemory({
        title: message.title,
        content: contentToSave.slice(0, 10000),
        type: "knowledge",
        source: "browser-extension",
        tags: [new URL(message.url).hostname],
        confidence: 1.0,
        url: message.url,
        profileId: message.profileId,
      });
    }

    case "SAVE_YOUTUBE_VIDEO": {
      const content = `Channel: ${message.channel}\n\nTranscript:\n${message.transcript}`;
      return await tryCreateMemory({
        title: message.title,
        content: content.slice(0, 10000),
        type: "knowledge",
        source: "youtube",
        tags: ["youtube", message.channel],
        confidence: 1.0,
        url: message.url,
        profileId: message.profileId,
      });
    }

    case "CAPTURE_PROMPT": {
      const trimmed = message.prompt.trim();
      const title = trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
      return await tryCreateMemory({
        title,
        content: message.prompt.slice(0, 10000),
        type: "knowledge",
        source: "prompt-capture",
        tags: [new URL(message.url).hostname, message.platform, "prompt"],
        confidence: 0.8,
        url: message.url,
        profileId: message.profileId,
      });
    }

    case "SAVE_SELECTION": {
      const trimmed = message.selectedText.trim();
      const title = trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
      const hostname = new URL(message.pageUrl).hostname;

      console.log("[vmem] Saving selection:", {
        title,
        hostname,
        textLength: message.selectedText.length,
      });

      const result = await tryCreateMemory({
        title,
        content: message.selectedText.slice(0, 10000),
        type: "knowledge",
        source: "browser-extension",
        tags: [hostname, "selection"],
        confidence: 1.0,
        url: message.pageUrl,
        profileId: message.profileId,
      });
      if (!result.success) {
        console.error("[vmem] SAVE_SELECTION failed:", result.error);
      }
      return result;
    }

    case "CAPTURE_VISIBLE_TAB": {
      try {
        // omitting windowId targets the currently focused window which
        // is the one the user is interacting with when they triggered
        // the screenshot shortcut
        const dataUrl = await chrome.tabs.captureVisibleTab({
          format: "png",
        });
        return { type: "CAPTURE_RESULT", dataUrl };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        console.error("[vmem] CAPTURE_VISIBLE_TAB failed:", error);
        return { type: "CAPTURE_ERROR", error };
      }
    }

    case "SAVE_SCREENSHOT": {
      try {
        const blob = base64PngToBlob(message.base64Png);
        const memory = await saveScreenshot({
          blob,
          caption: message.caption,
          pageUrl: message.pageUrl,
          pageTitle: message.pageTitle,
          profileId: message.profileId,
        });
        return {
          type: "SAVE_RESULT",
          success: true,
          memoryId: memory.id,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        console.error("[vmem] SAVE_SCREENSHOT failed:", error);
        return { type: "SAVE_RESULT", success: false, error };
      }
    }

    case "IMPORT_BOOKMARKS": {
      try {
        const result = await importBookmarks();
        return {
          type: "IMPORT_RESULT",
          success: true,
          count: result.imported,
          locked: result.locked,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { type: "IMPORT_RESULT", success: false, count: 0, error };
      }
    }

    case "IMPORT_HISTORY": {
      try {
        const result = await importHistory(message.days);
        return {
          type: "IMPORT_RESULT",
          success: true,
          count: result.imported,
          locked: result.locked,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { type: "IMPORT_RESULT", success: false, count: 0, error };
      }
    }

    case "CANCEL_IMPORT": {
      cancelImport();
      return { type: "CANCEL_RESULT", success: true };
    }

    case "DEBUG_RUN_AUTO_SYNC": {
      await runAutoSyncNow();
      const storage = await getStorage();
      return {
        type: "DEBUG_SYNC_RESULT",
        lastHistorySync: storage.lastHistorySync,
        lastBookmarkSync: storage.lastBookmarkSync,
      };
    }
  }
}
