/**
 * WebLLM model catalog for in-browser inference.
 * Mirrors mobile's MODELS array from model-manager.ts but uses WebLLM model IDs.
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
}

export const WEB_LLM_MODELS: WebLLMModelInfo[] = [
  {
    id: "SmolLM2-135M-Instruct-q4f16_1-MLC",
    name: "SmolLM2 135M",
    size: "~100MB",
    description: "Ultra-fast, limited quality",
    vramMB: 720,
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    name: "Qwen 2.5 0.5B",
    size: "~350MB",
    description: "Good balance for low VRAM",
    vramMB: 1200,
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    name: "Llama 3.2 1B",
    size: "~700MB",
    description: "Recommended default",
    vramMB: 2000,
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    name: "Phi 3.5 Mini 3.8B",
    size: "~2.2GB",
    description: "Best quality, needs good GPU",
    vramMB: 4500,
  },
];

/**
 * Find a model by its ID, returns undefined if not found.
 */
export function findModel(modelId: string): WebLLMModelInfo | undefined {
  return WEB_LLM_MODELS.find((m) => m.id === modelId);
}
