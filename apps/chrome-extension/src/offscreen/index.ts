import {
  loadModel,
  generateFullEnrichment,
  unloadModel,
  getModelStatus,
  type ModelStatus,
} from "./enrichment-engine";

interface LoadModelMessage {
  type: "LOAD_MODEL";
}

interface GenerateEnrichmentMessage {
  type: "GENERATE_ENRICHMENT";
  requestId: string;
  title: string;
  content: string;
  existingMemories: Array<{ id: string; title: string }>;
}

interface GetStatusMessage {
  type: "GET_STATUS";
}

interface UnloadModelMessage {
  type: "UNLOAD_MODEL";
}

type OffscreenMessage =
  | LoadModelMessage
  | GenerateEnrichmentMessage
  | GetStatusMessage
  | UnloadModelMessage;

interface ModelStatusResponse {
  type: "MODEL_STATUS";
  status: ModelStatus;
}

interface EnrichmentGeneratedResponse {
  type: "ENRICHMENT_GENERATED";
  requestId: string;
  result: { tags: string[]; relatedMemoryIds: string[] } | null;
  error?: string;
}

interface ModelLoadProgressResponse {
  type: "MODEL_LOAD_PROGRESS";
  progress: number;
  text: string;
}

type OffscreenResponse =
  | ModelStatusResponse
  | EnrichmentGeneratedResponse
  | ModelLoadProgressResponse;

function sendToBackground(message: OffscreenResponse): void {
  chrome.runtime.sendMessage(message).catch((err) => {
    console.debug("[offscreen] Failed to send message:", err);
  });
}

chrome.runtime.onMessage.addListener(
  (
    message: OffscreenMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: OffscreenResponse) => void,
  ) => {
    void handleMessage(message, sendResponse);
    return true;
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

    case "GENERATE_ENRICHMENT": {
      console.log("[offscreen] Generating enrichment for:", message.title);
      try {
        const result = await generateFullEnrichment(
          message.title,
          message.content,
          message.existingMemories,
        );
        sendResponse({
          type: "ENRICHMENT_GENERATED",
          requestId: message.requestId,
          result,
        });
      } catch (err) {
        console.error("[offscreen] Enrichment generation failed:", err);
        sendResponse({
          type: "ENRICHMENT_GENERATED",
          requestId: message.requestId,
          result: null,
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

console.log("[offscreen] Document loaded, ready for WebLLM inference");
