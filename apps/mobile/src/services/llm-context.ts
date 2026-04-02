import { llama } from "@react-native-ai/llama";
import type { LanguageModel } from "ai";
import {
  getLocalModelPath,
  checkModelStatus,
  getActiveModelIdOrDefault,
} from "./model-manager";

let activeModel: ReturnType<typeof llama.languageModel> | null = null;
let activeModelId: string | null = null;
let preparing = false;

export async function getLocalModel(): Promise<LanguageModel | null> {
  const currentId = await getActiveModelIdOrDefault();

  if (activeModel && activeModelId === currentId) return activeModel;

  if (activeModel && activeModelId !== currentId) {
    await unloadLocalModel();
  }

  if (preparing) return null;

  const status = await checkModelStatus(currentId);
  if (status.state !== "ready") return null;

  preparing = true;
  try {
    const path = getLocalModelPath(currentId);
    const model = llama.languageModel(path);
    await model.prepare();
    activeModel = model;
    activeModelId = currentId;
    return model;
  } catch {
    activeModel = null;
    activeModelId = null;
    return null;
  } finally {
    preparing = false;
  }
}

export async function unloadLocalModel(): Promise<void> {
  if (activeModel) {
    await activeModel.unload();
    activeModel = null;
    activeModelId = null;
  }
}

export function isModelLoaded(): boolean {
  return activeModel !== null;
}
