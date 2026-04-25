import {
  buildFullEnrichmentPrompt,
  parseFullEnrichmentResponse,
} from "@vmem/backend/enrichmentPrompt";

interface LanguageModelCapabilities {
  available: "no" | "readily" | "after-download";
}

interface LanguageModel {
  prompt(input: string): Promise<string>;
  destroy(): void;
}

interface LanguageModelAPI {
  capabilities(): Promise<LanguageModelCapabilities>;
  create(): Promise<LanguageModel>;
}

function isLanguageModelAPI(value: unknown): value is LanguageModelAPI {
  if (typeof value !== "object" || value === null) return false;
  const capabilities = Reflect.get(value, "capabilities");
  const create = Reflect.get(value, "create");
  return typeof capabilities === "function" && typeof create === "function";
}

function getChromeAI(): LanguageModelAPI | undefined {
  for (const key of ["aiOriginTrial", "ai"]) {
    if (!Reflect.has(chrome, key)) continue;
    const ns = Reflect.get(chrome, key);
    if (typeof ns !== "object" || ns === null) continue;
    const lm = Reflect.get(ns, "languageModel");
    if (isLanguageModelAPI(lm)) return lm;
  }
  return undefined;
}

export async function checkChromeAIAvailability(): Promise<
  "no" | "readily" | "after-download" | null
> {
  try {
    const api = getChromeAI();

    if (!api) {
      console.log("[chrome-ai] API not available");
      return null;
    }

    const capabilities = await api.capabilities();
    console.log("[chrome-ai] Availability:", capabilities.available);
    return capabilities.available;
  } catch (err) {
    console.error("[chrome-ai] Error checking availability:", err);
    return null;
  }
}

export async function runFullEnrichmentWithChromeAI(
  title: string,
  content: string,
  existingMemories: Array<{ id: string; title: string }>,
): Promise<{
  tags: string[];
  relatedMemoryIds: string[];
  entities: Array<{ name: string; normalizedName: string; type: string }>;
} | null> {
  try {
    const api = getChromeAI();

    if (!api) {
      return null;
    }

    const capabilities = await api.capabilities();
    if (capabilities.available === "no") {
      console.log("[chrome-ai] Model not available on this device");
      return null;
    }

    if (capabilities.available === "after-download") {
      console.log(
        "[chrome-ai] Model requires download, falling back to WebLLM",
      );
      return null;
    }

    const session = await api.create();
    const prompt = buildFullEnrichmentPrompt(title, content, existingMemories);

    try {
      const response = await session.prompt(prompt);
      console.log("[chrome-ai] Raw response:", response);

      const parsed = parseFullEnrichmentResponse(response);
      if (parsed && parsed.tags.length > 0) {
        console.log("[chrome-ai] Enrichment:", parsed);
        return {
          tags: parsed.tags.slice(0, 5),
          relatedMemoryIds: parsed.relatedMemoryIds,
          entities: parsed.entities,
        };
      }

      return null;
    } finally {
      session.destroy();
    }
  } catch (err) {
    console.error("[chrome-ai] Inference failed:", err);
    return null;
  }
}
