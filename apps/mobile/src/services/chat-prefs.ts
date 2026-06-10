import * as SecureStore from "expo-secure-store";

const PROVIDER_KEY = "vmemChatProvider";
const CLOUD_MODEL_KEY = "vmemCloudModelId";

export type ChatProviderMode = "local" | "cloud";

/** Mirrors web's localStorage `vmem:chatProvider` (SecureStore here, same as the active-model id). */
export async function getStoredChatProvider(): Promise<ChatProviderMode> {
  const stored = await SecureStore.getItemAsync(PROVIDER_KEY);
  return stored === "cloud" ? "cloud" : "local";
}

export async function setStoredChatProvider(
  provider: ChatProviderMode,
): Promise<void> {
  await SecureStore.setItemAsync(PROVIDER_KEY, provider);
}

/** Mirrors web's localStorage `vmem:cloudModelId`. */
export async function getStoredCloudModelId(): Promise<string | null> {
  return SecureStore.getItemAsync(CLOUD_MODEL_KEY);
}

export async function setStoredCloudModelId(modelId: string): Promise<void> {
  await SecureStore.setItemAsync(CLOUD_MODEL_KEY, modelId);
}
