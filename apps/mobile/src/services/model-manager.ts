import {
  downloadModel,
  isModelDownloaded,
  getModelPath,
  removeModel,
} from "@react-native-ai/llama";
import * as SecureStore from "expo-secure-store";

const ACTIVE_MODEL_KEY = "vmemActiveModelId";

export interface ModelInfo {
  id: string;
  name: string;
  size: string;
  description: string;
}

export const MODELS: ModelInfo[] = [
  {
    id: "TinyLlama/TinyLlama-1.1B-Chat-v1.0-GGUF/TinyLlama-1.1B-Chat-v1.0.Q4_K_M.gguf",
    name: "TinyLlama 1.1B",
    size: "~0.7GB",
    description: "Fast, lightweight general chat",
  },
  {
    id: "bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    name: "Llama 3.2 3B",
    size: "~2GB",
    description: "Balanced general-purpose",
  },
  {
    id: "bartowski/Phi-3.5-mini-instruct-GGUF/Phi-3.5-mini-instruct-Q4_K_M.gguf",
    name: "Phi-3.5 Mini 3.8B",
    size: "~2.2GB",
    description: "Strong reasoning for its size",
  },
  {
    id: "bartowski/Mistral-7B-Instruct-v0.3-GGUF/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    name: "Mistral 7B v0.3",
    size: "~4.1GB",
    description: "High quality, needs more RAM",
  },
];

export type ModelState =
  | { state: "not_downloaded" }
  | { state: "downloading"; progress: number }
  | { state: "ready"; path: string }
  | { state: "error"; message: string };

export async function checkModelStatus(modelId: string): Promise<ModelState> {
  try {
    const downloaded = await isModelDownloaded(modelId);
    if (downloaded) {
      const path = getModelPath(modelId);
      return { state: "ready", path };
    }
    return { state: "not_downloaded" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { state: "error", message };
  }
}

export async function startModelDownload(
  modelId: string,
  onProgress: (progress: number) => void,
): Promise<string> {
  const path = await downloadModel(modelId, (p) => {
    onProgress(p.percentage);
  });
  return path;
}

export async function deleteModel(modelId: string): Promise<void> {
  await removeModel(modelId);
  const activeId = await getActiveModelId();
  if (activeId === modelId) {
    await SecureStore.deleteItemAsync(ACTIVE_MODEL_KEY);
  }
}

export function getLocalModelPath(modelId: string): string {
  return getModelPath(modelId);
}

export async function getActiveModelId(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_MODEL_KEY);
}

export async function setActiveModelId(modelId: string): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_MODEL_KEY, modelId);
}

export async function getActiveModelIdOrDefault(): Promise<string> {
  const stored = await getActiveModelId();
  if (stored) return stored;
  return MODELS[1].id;
}
