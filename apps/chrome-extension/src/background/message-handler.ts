import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import {
  createMemory,
  retrieveMemories,
  applyEnrichment,
  listRecentMemoryTitlesForEnrichment,
} from "./api-client";
import { savePageFromTab } from "./context-menu";
import { importBookmarks } from "./import-bookmarks";
import { importHistory } from "./import-history";
import { cancelImport } from "./import-cancel";
import {
  enrichMemory,
  getEnrichmentStatus,
  loadWebLLMModel,
} from "./enrichment-router";
import { getStorage } from "@/lib/storage";

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

/**
 * Enrich a memory with local LLM-generated tags.
 * Called after memory creation if local enrichment is enabled.
 * Non-blocking - doesn't fail the memory creation if enrichment fails.
 */
async function enrichMemoryLocally(
  memoryId: string,
  title: string,
  content: string,
): Promise<void> {
  try {
    const { localEnrichmentEnabled } = await getStorage();
    if (!localEnrichmentEnabled) {
      console.log("[enrichment] Local enrichment disabled, skipping");
      return;
    }

    console.log("[enrichment] Enriching memory:", memoryId);
    const existing = await listRecentMemoryTitlesForEnrichment(memoryId);
    const result = await enrichMemory(title, content, existing);

    if (result && result.tags.length > 0) {
      console.log("[enrichment] Generated enrichment:", result);
      await applyEnrichment(memoryId, result.tags, result.relatedMemoryIds);
      console.log("[enrichment] Enrichment applied successfully");
    } else {
      console.log("[enrichment] No enrichment generated");
    }
  } catch (err) {
    // Don't fail the memory creation if enrichment fails
    console.error("[enrichment] Failed to enrich memory:", err);
  }
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
        // Enrich in background (non-blocking)
        void enrichMemoryLocally(
          result.memory.id,
          message.title,
          message.content,
        );
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
        // Enrich in background (non-blocking)
        void enrichMemoryLocally(result.memory.id, title, message.selectedText);
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

    case "CANCEL_IMPORT": {
      cancelImport();
      return { type: "CANCEL_RESULT", success: true };
    }

    case "GET_ENRICHMENT_STATUS": {
      const status = await getEnrichmentStatus();
      return {
        type: "ENRICHMENT_STATUS",
        method: status.method,
        modelLoaded: status.modelLoaded,
        modelProgress: status.modelProgress,
      };
    }

    case "LOAD_ENRICHMENT_MODEL": {
      try {
        const success = await loadWebLLMModel((progress, text) => {
          // Send progress updates to popup
          chrome.runtime
            .sendMessage({
              type: "MODEL_LOAD_PROGRESS",
              progress,
              text,
            })
            .catch(() => {
              // Popup might be closed, ignore
            });
        });
        return { type: "MODEL_LOAD_RESULT", success };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { type: "MODEL_LOAD_RESULT", success: false, error };
      }
    }
  }
}
