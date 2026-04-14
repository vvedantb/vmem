/**
 * Local model catalog for in-browser inference.
 * Supports multiple runtimes: WebLLM (MLC) and MediaPipe.
 * Ordered by size (smallest → largest) within each provider.
 */

export type LocalModelRuntime = "webllm" | "mediapipe";

export interface LocalModelInfo {
  /** Model ID (runtime-specific) */
  id: string;
  /** Provider / model family (e.g. "Qwen", "Llama", "Gemma") */
  provider: string;
  /** Human-readable display name */
  name: string;
  /** Approximate download size */
  size: string;
  /** Approximate VRAM required in MB */
  vramMB: number;
  /** Maximum context window in tokens */
  contextLength: number;
  /** Runtime engine to use */
  runtime: LocalModelRuntime;
}

export const LOCAL_MODELS: LocalModelInfo[] = [
  // ── Qwen (WebLLM) ───────────────────────────────────────────────
  {
    id: "Qwen3-0.6B-q4f16_1-MLC",
    provider: "Qwen",
    name: "Qwen 3 0.6B",
    size: "~400MB",
    vramMB: 800,
    contextLength: 4096,
    runtime: "webllm",
  },
  {
    id: "Qwen3-1.7B-q4f16_1-MLC",
    provider: "Qwen",
    name: "Qwen 3 1.7B",
    size: "~1.1GB",
    vramMB: 2200,
    contextLength: 4096,
    runtime: "webllm",
  },
  {
    id: "Qwen3-4B-q4f16_1-MLC",
    provider: "Qwen",
    name: "Qwen 3 4B",
    size: "~2.5GB",
    vramMB: 4500,
    contextLength: 4096,
    runtime: "webllm",
  },
  {
    id: "Qwen3-8B-q4f16_1-MLC",
    provider: "Qwen",
    name: "Qwen 3 8B",
    size: "~4.5GB",
    vramMB: 6800,
    contextLength: 4096,
    runtime: "webllm",
  },

  // ── Llama (WebLLM) ──────────────────────────────────────────────
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    provider: "Llama",
    name: "Llama 3.2 1B",
    size: "~700MB",
    vramMB: 2000,
    contextLength: 8192,
    runtime: "webllm",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    provider: "Llama",
    name: "Llama 3.2 3B",
    size: "~1.8GB",
    vramMB: 3500,
    contextLength: 8192,
    runtime: "webllm",
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    provider: "Llama",
    name: "Llama 3.1 8B",
    size: "~4.3GB",
    vramMB: 5700,
    contextLength: 4096,
    runtime: "webllm",
  },

  // ── DeepSeek (WebLLM) ───────────────────────────────────────────
  {
    id: "DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC",
    provider: "DeepSeek",
    name: "DeepSeek R1 1.5B",
    size: "~1.0GB",
    vramMB: 2000,
    contextLength: 4096,
    runtime: "webllm",
  },

  // ── Gemma (MediaPipe) ───────────────────────────────────────────
  // Note: MediaPipe web models have limited context (2048 total tokens incl. output)
  {
    id: "gemma-4-e2b-it",
    provider: "Gemma",
    name: "Gemma 4 E2B",
    size: "~2GB",
    vramMB: 3000,
    contextLength: 2048,
    runtime: "mediapipe",
  },
  {
    id: "gemma-4-e4b-it",
    provider: "Gemma",
    name: "Gemma 4 E4B",
    size: "~3GB",
    vramMB: 5000,
    contextLength: 2048,
    runtime: "mediapipe",
  },
];

/** Find a model by its ID. */
export function findModel(modelId: string): LocalModelInfo | undefined {
  return LOCAL_MODELS.find((m) => m.id === modelId);
}

/** Group models by provider, preserving insertion order. */
export function groupByProvider(): Map<string, LocalModelInfo[]> {
  const groups = new Map<string, LocalModelInfo[]>();
  for (const model of LOCAL_MODELS) {
    const existing = groups.get(model.provider);
    if (existing) {
      existing.push(model);
    } else {
      groups.set(model.provider, [model]);
    }
  }
  return groups;
}

// Re-export for backwards compatibility during migration
export type WebLLMModelInfo = LocalModelInfo;
export const WEB_LLM_MODELS = LOCAL_MODELS;
