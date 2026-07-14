import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { createMemory, retrieveMemories, saveScreenshot } from "./api-client";
import { importBookmarks } from "./import-bookmarks";
import { importHistory } from "./import-history";
import { cancelImport } from "./import-cancel";
import { runAutoSyncNow } from "./sync-scheduler";
import { getStorage } from "@/lib/storage";
import { htmlToMarkdown } from "@/lib/page-extraction";
import { z } from "zod";

const contentMessageTypeSchema = z.object({ type: z.string() });

const HANDLED_TYPES = new Set<string>([
  "RETRIEVE_MEMORIES",
  "SAVE_PAGE",
  "SAVE_SELECTION",
  "SAVE_YOUTUBE_VIDEO",
  "CAPTURE_PROMPT",
  "SAVE_SCREENSHOT",
  "CAPTURE_VISIBLE_TAB",
  "IMPORT_BOOKMARKS",
  "IMPORT_HISTORY",
  "CANCEL_IMPORT",
  "DEBUG_RUN_AUTO_SYNC",
  "DEBUG_PING",
]);

export function registerMessageHandler(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ContentMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: BackgroundResponse) => void,
    ) => {
      const typeParsed = contentMessageTypeSchema.safeParse(message);
      if (!typeParsed.success) {
        console.log("[message-handler] Not handled, skipping");
        return false;
      }
      const messageType = typeParsed.data.type;
      console.log("[message-handler] Received:", messageType);
      if (typeof messageType !== "string" || !HANDLED_TYPES.has(messageType)) {
        console.log("[message-handler] Not handled, skipping");
        return false;
      }
      console.log("[message-handler] Handling:", messageType);
      void handleMessage(message).then(sendResponse);
      return true;
    },
  );
}

/**
 * Decode a base64 PNG payload (no data URL prefix) into a Blob suitable
 * for upload. atob is available in service workers; using a Uint8Array
 * avoids the subtle bug where wrapping a binary string directly in a
 * Blob produces UTF-8-mangled output.
 */
function base64PngToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
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
      try {
        // Convert HTML to markdown if provided, otherwise use plain content
        let contentToSave = message.content;
        if (message.markdown) {
          // markdown field contains HTML from page extraction - convert it
          contentToSave = htmlToMarkdown(message.markdown);
        }
        const memory = await createMemory({
          title: message.title,
          content: contentToSave.slice(0, 10000),
          type: "knowledge",
          source: "browser-extension",
          tags: [new URL(message.url).hostname],
          confidence: 1.0,
          url: message.url,
          profileId: message.profileId,
        });
        return {
          type: "SAVE_RESULT",
          success: true,
          memoryId: memory.id,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { type: "SAVE_RESULT", success: false, error };
      }
    }

    case "SAVE_YOUTUBE_VIDEO": {
      try {
        const content = `Channel: ${message.channel}\n\nTranscript:\n${message.transcript}`;
        const memory = await createMemory({
          title: message.title,
          content: content.slice(0, 10000),
          type: "knowledge",
          source: "youtube",
          tags: ["youtube", message.channel],
          confidence: 1.0,
          url: message.url,
          profileId: message.profileId,
        });
        return {
          type: "SAVE_RESULT",
          success: true,
          memoryId: memory.id,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { type: "SAVE_RESULT", success: false, error };
      }
    }

    case "CAPTURE_PROMPT": {
      try {
        const trimmed = message.prompt.trim();
        const title =
          trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
        const hostname = new URL(message.url).hostname;

        const memory = await createMemory({
          title,
          content: message.prompt.slice(0, 10000),
          type: "knowledge",
          source: "prompt-capture",
          tags: [hostname, message.platform, "prompt"],
          confidence: 0.8,
          url: message.url,
          profileId: message.profileId,
        });
        return {
          type: "SAVE_RESULT",
          success: true,
          memoryId: memory.id,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { type: "SAVE_RESULT", success: false, error };
      }
    }

    case "SAVE_SELECTION": {
      try {
        const trimmed = message.selectedText.trim();
        const title =
          trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
        const hostname = new URL(message.pageUrl).hostname;

        console.log("[vmem] Saving selection:", {
          title,
          hostname,
          textLength: message.selectedText.length,
        });

        const memory = await createMemory({
          title,
          content: message.selectedText.slice(0, 10000),
          type: "knowledge",
          source: "browser-extension",
          tags: [hostname, "selection"],
          confidence: 1.0,
          url: message.pageUrl,
          profileId: message.profileId,
        });
        return {
          type: "SAVE_RESULT",
          success: true,
          memoryId: memory.id,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        console.error("[vmem] SAVE_SELECTION failed:", error);
        return { type: "SAVE_RESULT", success: false, error };
      }
    }

    case "CAPTURE_VISIBLE_TAB": {
      try {
        // Omitting windowId targets the currently-focused window, which
        // is the one the user is interacting with when they triggered
        // the screenshot shortcut.
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

    case "DEBUG_PING": {
      return { type: "DEBUG_PING_RESULT", timestamp: Date.now() };
    }
  }
}
