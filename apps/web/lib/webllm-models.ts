/**
 * WebLLM model catalog for in-browser inference.
 * Only includes models available in @mlc-ai/web-llm 0.2.82.
 * Ordered by size (smallest → largest) within tiers.
 */

export interface WebLLMModelInfo {
  /** WebLLM model ID (from prebuiltAppConfig) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Approximate download size */
  size: string;
  /** Short description */
  description: string;
  /** Approximate VRAM required in MB */
  vramMB: number;
  /** Maximum context window in tokens */
  contextLength: number;
}

export const WEB_LLM_MODELS: WebLLMModelInfo[] = [
  // ── Tiny (< 1 GB download) ──────────────────────────────────────
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    name: "SmolLM2 360M",
    size: "~250MB",
    description: "Ultra-fast, limited quality",
    vramMB: 500,
    contextLength: 2048,
  },
  {
    id: "Qwen3-0.6B-q4f16_1-MLC",
    name: "Qwen 3 0.6B",
    size: "~400MB",
    description: "Latest Qwen, tiny footprint",
    vramMB: 800,
    contextLength: 4096,
  },

  // ── Small (1–2 GB download) ─────────────────────────────────────
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    name: "Llama 3.2 1B",
    size: "~700MB",
    description: "Solid default",
    vramMB: 2000,
    contextLength: 8192,
  },
  {
    id: "Qwen3-1.7B-q4f16_1-MLC",
    name: "Qwen 3 1.7B",
    size: "~1.1GB",
    description: "Best quality at 1B tier",
    vramMB: 2200,
    contextLength: 4096,
  },
  {
    id: "DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC",
    name: "DeepSeek R1 1.5B",
    size: "~1.0GB",
    description: "Reasoning-focused distillation",
    vramMB: 2000,
    contextLength: 4096,
  },
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    name: "Gemma 2 2B",
    size: "~1.4GB",
    description: "Google's latest available in-browser",
    vramMB: 2500,
    contextLength: 8192,
  },

  // ── Medium (2–4 GB download) ────────────────────────────────────
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    name: "Llama 3.2 3B",
    size: "~1.8GB",
    description: "Strong general-purpose",
    vramMB: 3500,
    contextLength: 8192,
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    name: "Phi 3.5 Mini 3.8B",
    size: "~2.2GB",
    description: "Best quality under 4B params",
    vramMB: 4500,
    contextLength: 4096,
  },
  {
    id: "Qwen3-4B-q4f16_1-MLC",
    name: "Qwen 3 4B",
    size: "~2.5GB",
    description: "Excellent reasoning at 4B tier",
    vramMB: 4500,
    contextLength: 4096,
  },

  // ── Large (4+ GB download, needs good GPU) ──────────────────────
  {
    id: "Qwen3-8B-q4f16_1-MLC",
    name: "Qwen 3 8B",
    size: "~4.5GB",
    description: "Top quality, needs 6GB+ VRAM",
    vramMB: 6800,
    contextLength: 4096,
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    name: "Llama 3.1 8B",
    size: "~4.3GB",
    description: "Full 8B, needs 6GB+ VRAM",
    vramMB: 5700,
    contextLength: 4096,
  },
  {
    id: "gemma-2-9b-it-q4f16_1-MLC",
    name: "Gemma 2 9B",
    size: "~5.0GB",
    description: "Google's largest in-browser model",
    vramMB: 7000,
    contextLength: 8192,
  },
];

/**
 * Find a model by its ID, returns undefined if not found.
 */
export function findModel(modelId: string): WebLLMModelInfo | undefined {
  return WEB_LLM_MODELS.find((m) => m.id === modelId);
}
