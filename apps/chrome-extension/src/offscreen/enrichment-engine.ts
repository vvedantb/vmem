import {
  CreateMLCEngine,
  type MLCEngine,
  type InitProgressReport,
} from "@mlc-ai/web-llm";
import {
  buildFullEnrichmentPrompt,
  parseFullEnrichmentResponse,
} from "@vmem/backend/enrichmentPrompt";

const MODEL_ID = "Qwen3-0.6B-q4f16_1-MLC";

export interface ModelStatus {
  state: "idle" | "loading" | "ready" | "error";
  modelId: string | null;
  progress: number;
  error?: string;
}

let engine: MLCEngine | null = null;
let status: ModelStatus = {
  state: "idle",
  modelId: null,
  progress: 0,
};

export function getModelStatus(): ModelStatus {
  return { ...status };
}

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

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
    const initProgressCallback = (report: InitProgressReport) => {
      const progress = Math.round(report.progress * 100);
      status.progress = progress;
      onProgress?.(progress, report.text);
      console.log(`[webllm] ${report.text} (${String(progress)}%)`);
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

export async function generateFullEnrichment(
  title: string,
  content: string,
  existingMemories: Array<{ id: string; title: string }>,
): Promise<{ tags: string[]; relatedMemoryIds: string[] } | null> {
  if (!engine || status.state !== "ready") {
    console.error("[webllm] Model not loaded, cannot generate enrichment");
    return null;
  }

  const prompt = buildFullEnrichmentPrompt(title, content, existingMemories);

  try {
    const response = await engine.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      console.error("[webllm] Empty response from model");
      return null;
    }

    console.log("[webllm] Raw response:", raw);

    const parsed = parseFullEnrichmentResponse(raw);
    if (parsed && parsed.tags.length > 0) {
      console.log("[webllm] Enrichment:", parsed);
      return {
        tags: parsed.tags.slice(0, 5),
        relatedMemoryIds: parsed.relatedMemoryIds,
      };
    }

    return null;
  } catch (err) {
    console.error("[webllm] Inference failed:", err);
    return null;
  }
}
