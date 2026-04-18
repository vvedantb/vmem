/**
 * Unified local LLM engine manager.
 * Routes between WebLLM (MLC) and MediaPipe based on model runtime.
 *
 * WebLLM: Used for Qwen, Llama, DeepSeek models
 * MediaPipe: Used for Gemma models (optimized by Google)
 */

import type { LanguageModelV3 } from "@ai-sdk/provider";
import { webLLM, type WebLLMLanguageModel } from "@built-in-ai/web-llm";
import type { InitProgressReport, MLCEngineInterface } from "@mlc-ai/web-llm";
import { findModel, type LocalModelRuntime } from "./local-models";
import {
  loadMediaPipeModel,
  unloadMediaPipeModel,
  getMediaPipeModel,
  getLoadedMediaPipeModelId,
  type MediaPipeProgressReport,
} from "./mediapipe-engine";
import { createMediaPipeLanguageModel } from "./mediapipe-model-adapter";

// Union type for both model types
export type LocalLanguageModel = LanguageModelV3;

// WebLLM singleton state
let webllmModel: WebLLMLanguageModel | null = null;
let webllmModelId: string | null = null;
let webllmEngine: MLCEngineInterface | null = null;
let webllmWorker: Worker | null = null;

// MediaPipe wrapped model
let mediapipeWrappedModel: LanguageModelV3 | null = null;

// Current active runtime
let currentRuntime: LocalModelRuntime | null = null;

/**
 * Get or create the shared Web Worker for WebLLM.
 */
function getWebLLMWorker(): Worker {
  if (webllmWorker) return webllmWorker;
  webllmWorker = new Worker(new URL("./webllm-worker.ts", import.meta.url), {
    type: "module",
  });
  return webllmWorker;
}

/**
 * Load a WebLLM model.
 */
async function loadWebLLMEngine(
  modelId: string,
  onProgress?: (progress: InitProgressReport) => void,
): Promise<WebLLMLanguageModel> {
  // If same model is already loaded, return it
  if (webllmModel && webllmModelId === modelId && webllmEngine) {
    return webllmModel;
  }

  // Unload any existing WebLLM model
  await unloadWebLLMEngine();

  const model = webLLM(modelId, { worker: getWebLLMWorker() });
  const engine = await model.createSessionWithProgress(onProgress);

  webllmModel = model;
  webllmModelId = modelId;
  webllmEngine = engine;

  return model;
}

/**
 * Unload the current WebLLM model.
 */
async function unloadWebLLMEngine(): Promise<void> {
  if (webllmEngine) {
    try {
      await webllmEngine.unload();
    } catch {
      // Engine may already be unloaded
    }
  }
  webllmModel = null;
  webllmModelId = null;
  webllmEngine = null;
}

/**
 * Load a model by ID, automatically selecting the correct runtime.
 * Returns an AI SDK compatible LanguageModel.
 */
export async function loadEngine(
  modelId: string,
  onProgress?: (progress: InitProgressReport) => void,
): Promise<LocalLanguageModel> {
  const modelInfo = findModel(modelId);
  if (!modelInfo) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  // Unload any model from the other runtime first
  if (currentRuntime && currentRuntime !== modelInfo.runtime) {
    await unloadEngine();
  }

  if (modelInfo.runtime === "mediapipe") {
    // Use MediaPipe for Gemma models
    const mediapipeOnProgress = onProgress
      ? (report: MediaPipeProgressReport) => {
          // Convert MediaPipe progress to WebLLM format
          onProgress({
            text: report.text,
            progress: report.progress / 100, // MediaPipe uses 0-100, WebLLM uses 0-1
            timeElapsed: 0, // MediaPipe doesn't track time
          });
        }
      : undefined;

    const inference = await loadMediaPipeModel(modelId, mediapipeOnProgress);
    mediapipeWrappedModel = createMediaPipeLanguageModel(inference, modelId);
    currentRuntime = "mediapipe";

    return mediapipeWrappedModel;
  } else {
    // Use WebLLM for other models
    const model = await loadWebLLMEngine(modelId, onProgress);
    currentRuntime = "webllm";

    return model;
  }
}

/**
 * Get the currently loaded model, or null if none is loaded.
 */
export function getEngine(): LocalLanguageModel | null {
  if (currentRuntime === "mediapipe") {
    return mediapipeWrappedModel;
  }
  return webllmModel;
}

/**
 * Unload the current model, freeing GPU memory.
 */
export async function unloadEngine(): Promise<void> {
  if (currentRuntime === "mediapipe") {
    await unloadMediaPipeModel();
    mediapipeWrappedModel = null;
  } else if (currentRuntime === "webllm") {
    await unloadWebLLMEngine();
  }
  currentRuntime = null;
}

/**
 * Check if an engine is currently loaded and ready.
 */
export function isEngineReady(): boolean {
  if (currentRuntime === "mediapipe") {
    return getMediaPipeModel() !== null;
  }
  return webllmModel !== null && webllmEngine !== null;
}

/**
 * Get the ID of the currently loaded model.
 */
export function getLoadedModelId(): string | null {
  if (currentRuntime === "mediapipe") {
    return getLoadedMediaPipeModelId();
  }
  return webllmModelId;
}

/**
 * Get the runtime of the currently loaded model.
 */
export function getCurrentRuntime(): LocalModelRuntime | null {
  return currentRuntime;
}

/**
 * Check if the browser supports WebGPU (required for both WebLLM and MediaPipe).
 */
export function isWebGPUSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return "gpu" in navigator;
}
