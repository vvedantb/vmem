/**
 * WebLLM enrichment engine for local tag generation.
 * Uses Qwen 3 0.6B model (~400MB) for fast, lightweight inference.
 */

import {
  CreateMLCEngine,
  type MLCEngine,
  type InitProgressReport,
} from "@mlc-ai/web-llm";
import {
  buildEnrichmentPrompt,
  parseEnrichmentResponse,
} from "../background/enrichment-prompt";

// Fixed model - Qwen 3 0.6B is the smallest model with good JSON output
const MODEL_ID = "Qwen3-0.6B-q4f16_1-MLC";

export interface ModelStatus {
  state: "idle" | "loading" | "ready" | "error";
  modelId: string | null;
  progress: number;
  error?: string;
}

// Module-level state
let engine: MLCEngine | null = null;
let status: ModelStatus = {
  state: "idle",
  modelId: null,
  progress: 0,
};

/**
 * Get the current model status.
 */
export function getModelStatus(): ModelStatus {
  return { ...status };
}

/**
 * Check if WebGPU is available in this context.
 */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/**
 * Load the Qwen 0.6B model for enrichment.
 * Progress callback receives (0-100, status text).
 */
export async function loadModel(
  onProgress?: (progress: number, text: string) => void,
): Promise<void> {
  if (status.state === "ready" && engine) {
    console.log("[webllm] Model already loaded");
    return;
  }

  if (status.state === "loading") {
    console.log("[webllm] Model is already loading");
    return;
  }

  if (!isWebGPUAvailable()) {
    status = {
      state: "error",
      modelId: null,
      progress: 0,
      error: "WebGPU not available",
    };
    throw new Error("WebGPU not available in this browser");
  }

  status = {
    state: "loading",
    modelId: MODEL_ID,
    progress: 0,
  };

  try {
    // Create the engine with progress tracking
    const initProgressCallback = (report: InitProgressReport) => {
      const progress = Math.round(report.progress * 100);
      status.progress = progress;
      onProgress?.(progress, report.text);
      console.log(`[webllm] ${report.text} (${progress}%)`);
    };

    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback,
    });

    status = {
      state: "ready",
      modelId: MODEL_ID,
      progress: 100,
    };

    console.log("[webllm] Model loaded successfully");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    status = {
      state: "error",
      modelId: null,
      progress: 0,
      error: errorMessage,
    };
    throw err;
  }
}

/**
 * Unload the model to free GPU memory.
 */
export async function unloadModel(): Promise<void> {
  if (engine) {
    await engine.unload();
    engine = null;
  }
  status = {
    state: "idle",
    modelId: null,
    progress: 0,
  };
  console.log("[webllm] Model unloaded");
}

/**
 * Generate tags for a memory using the local model.
 * Returns null if inference fails or model is not loaded.
 */
export async function generateTags(
  title: string,
  content: string,
): Promise<string[] | null> {
  if (!engine || status.state !== "ready") {
    console.error("[webllm] Model not loaded, cannot generate tags");
    return null;
  }

  const prompt = buildEnrichmentPrompt(title, content);

  try {
    const response = await engine.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3, // Lower temperature for more consistent JSON
      max_tokens: 200,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      console.error("[webllm] Empty response from model");
      return null;
    }

    console.log("[webllm] Raw response:", raw);

    const tags = parseEnrichmentResponse(raw);
    if (tags && tags.length > 0) {
      console.log("[webllm] Generated tags:", tags);
      return tags.slice(0, 5);
    }

    return null;
  } catch (err) {
    console.error("[webllm] Inference failed:", err);
    return null;
  }
}
