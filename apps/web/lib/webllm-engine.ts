/**
 * WebLLM engine manager — singleton that wraps @built-in-ai/web-llm.
 *
 * Manages a single WebLLMLanguageModel instance at a time (only one model in VRAM).
 * Uses a Web Worker for non-blocking inference.
 *
 * Mirrors mobile's llm-context.ts pattern.
 */
import { webLLM, type WebLLMLanguageModel } from "@built-in-ai/web-llm";
import type { InitProgressReport, MLCEngineInterface } from "@mlc-ai/web-llm";

const ACTIVE_MODEL_KEY = "vmem:activeWebLLMModelId";

// Singleton state
let currentModel: WebLLMLanguageModel | null = null;
let currentModelId: string | null = null;
let currentEngine: MLCEngineInterface | null = null;
let worker: Worker | null = null;

/**
 * Get or create the shared Web Worker for WebLLM.
 * The worker is lazily created on first use.
 */
function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./webllm-worker.ts", import.meta.url), {
    type: "module",
  });
  return worker;
}

/**
 * Load a model into the engine, downloading if needed.
 * Fires onProgress callbacks during download/initialization.
 * Returns the AI SDK LanguageModel ready for streamText().
 */
export async function loadEngine(
  modelId: string,
  onProgress?: (progress: InitProgressReport) => void,
): Promise<WebLLMLanguageModel> {
  // If same model is already loaded, return it
  if (currentModel && currentModelId === modelId && currentEngine) {
    return currentModel;
  }

  // Unload any existing model first
  await unloadEngine();

  const model = webLLM(modelId, { worker: getWorker() });
  const engine = await model.createSessionWithProgress(onProgress);

  currentModel = model;
  currentModelId = modelId;
  currentEngine = engine;

  return model;
}

/**
 * Get the currently loaded model, or null if none is loaded.
 */
export function getEngine(): WebLLMLanguageModel | null {
  return currentModel;
}

/**
 * Unload the current model, freeing VRAM.
 */
export async function unloadEngine(): Promise<void> {
  if (currentEngine) {
    try {
      await currentEngine.unload();
    } catch {
      // Engine may already be unloaded or terminated
    }
  }
  currentModel = null;
  currentModelId = null;
  currentEngine = null;
}

/**
 * Check if an engine is currently loaded and ready.
 */
export function isEngineReady(): boolean {
  return currentModel !== null && currentEngine !== null;
}

/**
 * Get the ID of the currently loaded model.
 */
export function getLoadedModelId(): string | null {
  return currentModelId;
}

/**
 * Get the user's preferred active model ID from localStorage.
 */
export function getActiveModelId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_MODEL_KEY);
}

/**
 * Set the user's preferred active model ID in localStorage.
 */
export function setActiveModelId(modelId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_MODEL_KEY, modelId);
}

/**
 * Clear the active model preference from localStorage.
 */
export function clearActiveModelId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACTIVE_MODEL_KEY);
}

/**
 * Check if the browser supports WebGPU (required for WebLLM).
 */
export function isWebGPUSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return "gpu" in navigator;
}
