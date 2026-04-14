/**
 * Offscreen document entry point for WebLLM inference.
 * This document has access to WebGPU which service workers don't have.
 *
 * Message protocol:
 * - LOAD_MODEL: Initialize WebLLM with Qwen 0.6B
 * - GENERATE_TAGS: Run inference to generate tags
 * - GET_STATUS: Get current model status
 * - UNLOAD_MODEL: Free GPU memory
 */

import {
  loadModel,
  generateTags,
  unloadModel,
  getModelStatus,
  type ModelStatus,
} from "./enrichment-engine";

// Message types from background script
interface LoadModelMessage {
  type: "LOAD_MODEL";
}

interface GenerateTagsMessage {
  type: "GENERATE_TAGS";
  requestId: string;
  title: string;
  content: string;
}

interface GetStatusMessage {
  type: "GET_STATUS";
}

interface UnloadModelMessage {
  type: "UNLOAD_MODEL";
}

type OffscreenMessage =
  | LoadModelMessage
  | GenerateTagsMessage
  | GetStatusMessage
  | UnloadModelMessage;

// Response types to background script
interface ModelStatusResponse {
  type: "MODEL_STATUS";
  status: ModelStatus;
}

interface TagsGeneratedResponse {
  type: "TAGS_GENERATED";
  requestId: string;
  tags: string[] | null;
  error?: string;
}

interface ModelLoadProgressResponse {
  type: "MODEL_LOAD_PROGRESS";
  progress: number;
  text: string;
}

type OffscreenResponse =
  | ModelStatusResponse
  | TagsGeneratedResponse
  | ModelLoadProgressResponse;

/**
 * Send a message to the background script.
 */
function sendToBackground(message: OffscreenResponse): void {
  chrome.runtime.sendMessage(message).catch((err) => {
    // Background might not be listening, that's okay
    console.debug("[offscreen] Failed to send message:", err);
  });
}

/**
 * Handle incoming messages from the background script.
 */
chrome.runtime.onMessage.addListener(
  (
    message: OffscreenMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: OffscreenResponse) => void,
  ) => {
    handleMessage(message, sendResponse);
    return true; // Keep channel open for async response
  },
);

async function handleMessage(
  message: OffscreenMessage,
  sendResponse: (response: OffscreenResponse) => void,
): Promise<void> {
  switch (message.type) {
    case "LOAD_MODEL": {
      console.log("[offscreen] Loading model...");
      try {
        await loadModel((progress, text) => {
          sendToBackground({
            type: "MODEL_LOAD_PROGRESS",
            progress,
            text,
          });
        });
        sendResponse({
          type: "MODEL_STATUS",
          status: getModelStatus(),
        });
      } catch (err) {
        console.error("[offscreen] Model load failed:", err);
        sendResponse({
          type: "MODEL_STATUS",
          status: getModelStatus(),
        });
      }
      break;
    }

    case "GENERATE_TAGS": {
      console.log("[offscreen] Generating tags for:", message.title);
      try {
        const tags = await generateTags(message.title, message.content);
        sendResponse({
          type: "TAGS_GENERATED",
          requestId: message.requestId,
          tags,
        });
      } catch (err) {
        console.error("[offscreen] Tag generation failed:", err);
        sendResponse({
          type: "TAGS_GENERATED",
          requestId: message.requestId,
          tags: null,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
      break;
    }

    case "GET_STATUS": {
      sendResponse({
        type: "MODEL_STATUS",
        status: getModelStatus(),
      });
      break;
    }

    case "UNLOAD_MODEL": {
      console.log("[offscreen] Unloading model...");
      await unloadModel();
      sendResponse({
        type: "MODEL_STATUS",
        status: getModelStatus(),
      });
      break;
    }
  }
}

// Log when offscreen document is loaded
console.log("[offscreen] Document loaded, ready for WebLLM inference");
