/**
 * Enrichment router - orchestrates local enrichment strategies.
 *
 * Priority:
 * 1. Chrome Built-in AI (Gemini Nano) - if available
 * 2. WebLLM via Offscreen Document - if Chrome AI unavailable
 * 3. Skip enrichment - if both fail
 *
 * No server fallback - local only for maximum privacy.
 */

import {
  checkChromeAIAvailability,
  generateTagsWithChromeAI,
} from "./chrome-ai-enrichment";
import { ensureOffscreenDocument, sendToOffscreen } from "./offscreen-manager";

// Types for offscreen communication
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

interface TagsGeneratedResponse {
  type: "TAGS_GENERATED";
  requestId: string;
  tags: string[] | null;
  error?: string;
}

// Track which enrichment method is active
let activeMethod: "chrome-ai" | "webllm" | null = null;
let webllmModelLoaded = false;

/**
 * Get the current enrichment method being used.
 */
export function getActiveEnrichmentMethod(): "chrome-ai" | "webllm" | null {
  return activeMethod;
}

/**
 * Check if WebLLM model is loaded and ready.
 */
export function isWebLLMReady(): boolean {
  return webllmModelLoaded;
}

/**
 * Initialize the enrichment router.
 * Checks which methods are available and prepares them.
 */
export async function initializeEnrichment(): Promise<void> {
  // Check Chrome AI availability
  const chromeAIAvailable = await checkChromeAIAvailability();

  if (chromeAIAvailable === "readily") {
    activeMethod = "chrome-ai";
    console.log("[enrichment-router] Using Chrome Built-in AI");
    return;
  }

  // Chrome AI not available, prepare WebLLM
  console.log(
    "[enrichment-router] Chrome AI not available, will use WebLLM fallback",
  );
  activeMethod = "webllm";

  // Check if WebLLM model is already loaded (from previous session)
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

/**
 * Load the WebLLM model manually (for settings UI).
 * Returns progress updates via callback.
 */
export async function loadWebLLMModel(
  onProgress?: (progress: number, text: string) => void,
): Promise<boolean> {
  try {
    await ensureOffscreenDocument();

    // Set up progress listener
    const progressListener = (message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message
      ) {
        const msg = message as {
          type: string;
          progress?: number;
          text?: string;
        };
        if (msg.type === "MODEL_LOAD_PROGRESS") {
          onProgress?.(msg.progress ?? 0, msg.text ?? "Loading...");
        }
      }
    };

    chrome.runtime.onMessage.addListener(progressListener);

    try {
      const response = await sendToOffscreen<ModelStatusResponse>({
        type: "LOAD_MODEL",
      });

      webllmModelLoaded = response.status.state === "ready";
      return webllmModelLoaded;
    } finally {
      chrome.runtime.onMessage.removeListener(progressListener);
    }
  } catch (err) {
    console.error("[enrichment-router] Failed to load WebLLM model:", err);
    return false;
  }
}

/**
 * Generate tags for a memory using the best available method.
 * Returns null if enrichment fails or is unavailable.
 */
export async function enrichMemory(
  title: string,
  content: string,
): Promise<string[] | null> {
  // Try Chrome AI first (if available)
  if (activeMethod === "chrome-ai") {
    console.log("[enrichment-router] Trying Chrome Built-in AI...");
    const tags = await generateTagsWithChromeAI(title, content);
    if (tags && tags.length > 0) {
      return tags;
    }

    // Chrome AI failed, try WebLLM fallback
    console.log("[enrichment-router] Chrome AI failed, falling back to WebLLM");
    activeMethod = "webllm";
  }

  // Try WebLLM
  if (activeMethod === "webllm") {
    console.log("[enrichment-router] Using WebLLM...");

    // Ensure model is loaded
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
      const response = await sendToOffscreen<TagsGeneratedResponse>({
        type: "GENERATE_TAGS",
        requestId,
        title,
        content,
      });

      if (response.tags && response.tags.length > 0) {
        return response.tags;
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

  // No enrichment method available
  console.log("[enrichment-router] No enrichment method available");
  return null;
}

/**
 * Get the current enrichment status for UI display.
 */
export async function getEnrichmentStatus(): Promise<{
  method: "chrome-ai" | "webllm" | null;
  modelLoaded: boolean;
  modelProgress?: number;
}> {
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
