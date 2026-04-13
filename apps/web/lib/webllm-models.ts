/**
 * WebLLM model catalog for in-browser inference.
 * Only includes models available in @mlc-ai/web-llm 0.2.82.
 * Ordered by size (smallest → largest) within each provider.
 */

export interface WebLLMModelInfo {
  /** WebLLM model ID (from prebuiltAppConfig) */
  id: string;
  /** Provider / model family (e.g. "Qwen", "Llama") */
  provider: string;
  /** Human-readable display name */
  name: string;
  /** Approximate download size */
  size: string;
  /** Approximate VRAM required in MB */
  vramMB: number;
  /** Maximum context window in tokens */
  contextLength: number;
}

export const WEB_LLM_MODELS: WebLLMModelInfo[] = [
  // ── Qwen ────────────────────────────────────────────────────────
  {
    id: "Qwen3-0.6B-q4f16_1-MLC",
    provider: "Qwen",
    name: "Qwen 3 0.6B",
    size: "~400MB",
    vramMB: 800,
    contextLength: 4096,
  },
  {
    id: "Qwen3-1.7B-q4f16_1-MLC",
    provider: "Qwen",
    name: "Qwen 3 1.7B",
    size: "~1.1GB",
    vramMB: 2200,
    contextLength: 4096,
  },
  {
    id: "Qwen3-4B-q4f16_1-MLC",
    provider: "Qwen",
    name: "Qwen 3 4B",
    size: "~2.5GB",
    vramMB: 4500,
    contextLength: 4096,
  },
  {
    id: "Qwen3-8B-q4f16_1-MLC",
    provider: "Qwen",
    name: "Qwen 3 8B",
    size: "~4.5GB",
    vramMB: 6800,
    contextLength: 4096,
  },

  // ── Llama ───────────────────────────────────────────────────────
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    provider: "Llama",
    name: "Llama 3.2 1B",
    size: "~700MB",
    vramMB: 2000,
    contextLength: 8192,
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    provider: "Llama",
    name: "Llama 3.2 3B",
    size: "~1.8GB",
    vramMB: 3500,
    contextLength: 8192,
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    provider: "Llama",
    name: "Llama 3.1 8B",
    size: "~4.3GB",
    vramMB: 5700,
    contextLength: 4096,
  },

  // ── Gemma ───────────────────────────────────────────────────────
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    provider: "Gemma",
    name: "Gemma 2 2B",
    size: "~1.4GB",
    vramMB: 2500,
    contextLength: 8192,
  },
  {
    id: "gemma-2-9b-it-q4f16_1-MLC",
    provider: "Gemma",
    name: "Gemma 2 9B",
    size: "~5.0GB",
    vramMB: 7000,
    contextLength: 8192,
  },

  // ── DeepSeek ────────────────────────────────────────────────────
  {
    id: "DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC",
    provider: "DeepSeek",
    name: "DeepSeek R1 1.5B",
    size: "~1.0GB",
    vramMB: 2000,
    contextLength: 4096,
  },

  // ── Phi ─────────────────────────────────────────────────────────
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    provider: "Phi",
    name: "Phi 3.5 Mini 3.8B",
    size: "~2.2GB",
    vramMB: 4500,
    contextLength: 4096,
  },

  // ── SmolLM ──────────────────────────────────────────────────────
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    provider: "SmolLM",
    name: "SmolLM2 360M",
    size: "~250MB",
    vramMB: 500,
    contextLength: 2048,
  },
];

/** Find a model by its ID. */
export function findModel(modelId: string): WebLLMModelInfo | undefined {
  return WEB_LLM_MODELS.find((m) => m.id === modelId);
}

/** Group models by provider, preserving insertion order. */
export function groupByProvider(): Map<string, WebLLMModelInfo[]> {
  const groups = new Map<string, WebLLMModelInfo[]>();
  for (const model of WEB_LLM_MODELS) {
    const existing = groups.get(model.provider);
    if (existing) {
      existing.push(model);
    } else {
      groups.set(model.provider, [model]);
    }
  }
  return groups;
}
