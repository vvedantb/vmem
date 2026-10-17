import { VMemory, type StructuredCreateMemoryInput } from "@vmem/sdk";
import type { Settings } from "./settings-schema";
import type { MemoryDraft } from "./summarise";

export interface ClientConfig {
  apiKey: string;
  baseUrl: string;
}

/** `VMEM_API_KEY` and `VMEM_BASE_URL` override saved settings (used by tests). */
export function resolveClientConfig(
  settings: Settings,
  env: Readonly<Record<string, string | undefined>>,
): ClientConfig | null {
  const apiKey = env["VMEM_API_KEY"] || settings.apiKey.trim();
  const baseUrl = env["VMEM_BASE_URL"] || settings.baseUrl;
  return apiKey ? { apiKey, baseUrl } : null;
}

function toCreateInput(draft: MemoryDraft): StructuredCreateMemoryInput {
  return {
    title: draft.title,
    content: draft.content,
    type: "episodic",
    source: "desktop",
    sourceType: "desktop",
    tags: [...new Set(["desktop", ...draft.tags])],
  };
}

export function createPoster(
  config: ClientConfig,
): (draft: MemoryDraft) => Promise<void> {
  const client = new VMemory({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
  return async (draft) => {
    await client.createMemory(toCreateInput(draft));
  };
}
