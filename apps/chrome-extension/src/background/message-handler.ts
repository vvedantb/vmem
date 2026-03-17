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
        const memory = await createMemory({
          title: message.title,
          content: message.content.slice(0, 10000),
          type: "knowledge",
          source: "browser-extension",
          tags: [new URL(message.url).hostname],
          confidence: 1.0,
        });
        return { type: "SAVE_RESULT", success: true, memoryId: memory.id };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { type: "SAVE_RESULT", success: false, error };
      }
    }

    case "IMPORT_BOOKMARKS": {
      try {
        const count = await importBookmarks();
        return { type: "IMPORT_RESULT", success: true, count };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { type: "IMPORT_RESULT", success: false, count: 0, error };
      }
    }

    case "IMPORT_HISTORY": {
      try {
        const count = await importHistory(message.days);
        return { type: "IMPORT_RESULT", success: true, count };
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
