import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { createMemory, retrieveMemories, testConnection } from "./api-client";
import { savePageFromTab } from "./context-menu";
import { importBookmarks } from "./import-bookmarks";
import { importHistory } from "./import-history";
import { cancelImport } from "./import-cancel";

export function registerMessageHandler(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ContentMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: BackgroundResponse) => void,
    ) => {
      handleMessage(message).then(sendResponse);
      return true;
    },
  );
}

async function handleMessage(
  message: ContentMessage,
): Promise<BackgroundResponse> {
  switch (message.type) {
    case "RETRIEVE_MEMORIES": {
      try {
        const memories = await retrieveMemories(message.query);
        return { type: "RETRIEVE_RESULT", memories };
      } catch (err) {
        return { type: "RETRIEVE_RESULT", memories: [] };
      }
    }

    case "SAVE_PAGE": {
      try {
        const result = await createMemory({
          title: message.title,
          content: message.content.slice(0, 10000),
          type: "knowledge",
          source: "browser-extension",
          tags: [new URL(message.url).hostname],
          confidence: 1.0,
          url: message.url,
        });
        if (result.status === "duplicate") {
          return {
            type: "SAVE_DUPLICATE",
            existingMemory: result.existingMemory,
          };
        }
        return {
          type: "SAVE_RESULT",
          success: true,
          memoryId: result.memory.id,
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

        const result = await createMemory({
          title,
          content: message.selectedText.slice(0, 10000),
          type: "knowledge",
          source: "browser-extension",
          tags: [hostname, "selection"],
          confidence: 1.0,
          url: message.pageUrl,
        });

        if (result.status === "duplicate") {
          return {
            type: "SAVE_DUPLICATE",
            existingMemory: result.existingMemory,
          };
        }
        return {
          type: "SAVE_RESULT",
          success: true,
          memoryId: result.memory.id,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        console.error("[vmem] SAVE_SELECTION failed:", error);
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

    case "TEST_CONNECTION": {
      try {
        const connected = await testConnection();
        return { type: "CONNECTION_RESULT", connected };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { type: "CONNECTION_RESULT", connected: false, error };
      }
    }

    case "CANCEL_IMPORT": {
      cancelImport();
      return { type: "CANCEL_RESULT", success: true };
    }
  }
}
