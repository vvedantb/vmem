import { llama } from "@react-native-ai/llama";
import type { LanguageModel } from "ai";
import { getLocalModelPath, checkModelStatus } from "./model-manager";

let activeModel: ReturnType<typeof llama.languageModel> | null = null;
let preparing = false;

export async function getLocalModel(): Promise<LanguageModel | null> {
  if (activeModel) return activeModel;
  if (preparing) return null;

  const status = await checkModelStatus();
  if (status.state !== "ready") return null;

  preparing = true;
  try {
    const path = getLocalModelPath();
    const model = llama.languageModel(path);
    await model.prepare();
    activeModel = model;
    return model;
  } catch {
    activeModel = null;
    return null;
  } finally {
    preparing = false;
  }
}

export async function unloadLocalModel(): Promise<void> {
  if (activeModel) {
    await activeModel.unload();
    activeModel = null;
  }
}

export function isModelLoaded(): boolean {
  return activeModel !== null;
}
