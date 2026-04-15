import {
  checkChromeAIAvailability,
  runFullEnrichmentWithChromeAI,
} from "./chrome-ai-enrichment";
import { ensureOffscreenDocument, sendToOffscreen } from "./offscreen-manager";

interface ModelStatus {
  state: "idle" | "loading" | "ready" | "error";
  modelId: string | null;
  progress: number;
  error?: string;
}

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

let activeMethod: "chrome-ai" | "webllm" | null = null;
let webllmModelLoaded = false;

export function getActiveEnrichmentMethod(): "chrome-ai" | "webllm" | null {
  return activeMethod;
}

export function isWebLLMReady(): boolean {
  return webllmModelLoaded;
}

export async function initializeEnrichment(): Promise<void> {
  const chromeAIAvailable = await checkChromeAIAvailability();

  if (chromeAIAvailable === "readily") {
    activeMethod = "chrome-ai";
    console.log("[enrichment-router] Using Chrome Built-in AI");
    return;
  }

  console.log(
    "[enrichment-router] Chrome AI not available, will use WebLLM fallback",
  );
  activeMethod = "webllm";

  try {
    await ensureOffscreenDocument();
    const response = await sendToOffscreen<ModelStatusResponse>({
      type: "GET_STATUS",
    });
    webllmModelLoaded = response.status.state === "ready";

    if (webllmModelLoaded) {
      console.log("[enrichment-router] WebLLM model already loaded");
    }
  } catch (err) {
    console.error("[enrichment-router] Failed to check WebLLM status:", err);
  }
}

export async function loadWebLLMModel(
  onProgress?: (progress: number, text: string) => void,
): Promise<boolean> {
  try {
    console.log(
      "[enrichment-router] loadWebLLMModel called, ensuring offscreen...",
    );
    await ensureOffscreenDocument();
    console.log("[enrichment-router] Offscreen document ready");

    const progressListener = (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      const type = Reflect.get(message, "type");
      if (type !== "MODEL_LOAD_PROGRESS") return;
      const progress = Reflect.get(message, "progress");
      const text = Reflect.get(message, "text");
      console.log("[enrichment-router] Progress:", progress, text);
      onProgress?.(
        typeof progress === "number" ? progress : 0,
        typeof text === "string" ? text : "Loading...",
      );
    };

    chrome.runtime.onMessage.addListener(progressListener);

    try {
      console.log("[enrichment-router] Sending LOAD_MODEL to offscreen...");
      const response = await sendToOffscreen<ModelStatusResponse>({
        type: "LOAD_MODEL",
      });
      console.log("[enrichment-router] Got response:", response);

      webllmModelLoaded = response?.status?.state === "ready";
      return webllmModelLoaded;
    } finally {
      chrome.runtime.onMessage.removeListener(progressListener);
    }
  } catch (err) {
    console.error("[enrichment-router] Failed to load WebLLM model:", err);
    return false;
  }
}

export async function enrichMemory(
  title: string,
  content: string,
  existingMemories: Array<{ id: string; title: string }>,
): Promise<{ tags: string[]; relatedMemoryIds: string[] } | null> {
  if (activeMethod === null) {
    await initializeEnrichment();
  }

  if (activeMethod === "chrome-ai") {
    console.log("[enrichment-router] Trying Chrome Built-in AI...");
    const result = await runFullEnrichmentWithChromeAI(
      title,
      content,
      existingMemories,
    );
    if (result && result.tags.length > 0) {
      return result;
    }

    console.log("[enrichment-router] Chrome AI failed, falling back to WebLLM");
    activeMethod = "webllm";
  }

  if (activeMethod === "webllm") {
    console.log("[enrichment-router] Using WebLLM...");

    if (!webllmModelLoaded) {
      console.log("[enrichment-router] Loading WebLLM model first...");
      const loaded = await loadWebLLMModel();
      if (!loaded) {
        console.error("[enrichment-router] Failed to load WebLLM model");
        return null;
      }
    }

    try {
      await ensureOffscreenDocument();

      const requestId = crypto.randomUUID();
      const response = await sendToOffscreen<EnrichmentGeneratedResponse>({
        type: "GENERATE_ENRICHMENT",
        requestId,
        title,
        content,
        existingMemories,
      });

      if (response.result && response.result.tags.length > 0) {
        return response.result;
      }

      if (response.error) {
        console.error("[enrichment-router] WebLLM error:", response.error);
      }

      return null;
    } catch (err) {
      console.error("[enrichment-router] WebLLM inference failed:", err);
      return null;
    }
  }

  console.log("[enrichment-router] No enrichment method available");
  return null;
}

export async function getEnrichmentStatus(): Promise<{
  method: "chrome-ai" | "webllm" | null;
  modelLoaded: boolean;
  modelProgress?: number;
}> {
  if (activeMethod === null) {
    await initializeEnrichment();
  }

  if (activeMethod === "chrome-ai") {
    return { method: "chrome-ai", modelLoaded: true };
  }

  if (activeMethod === "webllm") {
    try {
      await ensureOffscreenDocument();
      const response = await sendToOffscreen<ModelStatusResponse>({
        type: "GET_STATUS",
      });

      return {
        method: "webllm",
        modelLoaded: response.status.state === "ready",
        modelProgress:
          response.status.state === "loading"
            ? response.status.progress
            : undefined,
      };
    } catch {
      return { method: "webllm", modelLoaded: false };
    }
  }

  return { method: null, modelLoaded: false };
}
