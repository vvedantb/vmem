import {
  downloadModel,
  isModelDownloaded,
  getModelPath,
  removeModel,
} from "@react-native-ai/llama";

export const MODEL_ID =
  "bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf";

export type ModelStatus =
  | { state: "not_downloaded" }
  | { state: "downloading"; progress: number }
  | { state: "ready"; path: string }
  | { state: "error"; message: string };

export async function checkModelStatus(): Promise<ModelStatus> {
  try {
    const downloaded = await isModelDownloaded(MODEL_ID);
    if (downloaded) {
      const path = getModelPath(MODEL_ID);
      return { state: "ready", path };
    }
    return { state: "not_downloaded" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { state: "error", message };
  }
}

export async function startModelDownload(
  onProgress: (progress: number) => void,
): Promise<string> {
  const path = await downloadModel(MODEL_ID, (p) => {
    onProgress(p.percentage);
  });
  return path;
}

export async function deleteModel(): Promise<void> {
  await removeModel(MODEL_ID);
}

export function getLocalModelPath(): string {
  return getModelPath(MODEL_ID);
}
