/**
 * Chrome Built-in AI (Gemini Nano) integration for local enrichment.
 * Available in Chrome 138+ with the optimization flag enabled.
 *
 * This is the preferred path when available - zero download, instant inference.
 */

import {
  buildEnrichmentPrompt,
  parseEnrichmentResponse,
} from "./enrichment-prompt";

// Chrome AI API types (not yet in @types/chrome)
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

interface ChromeAINamespace {
  languageModel?: LanguageModelAPI;
}

// Access Chrome AI APIs with proper typing
function getChromeAI(): LanguageModelAPI | undefined {
  const chromeWithAI = chrome as typeof chrome & {
    aiOriginTrial?: ChromeAINamespace;
    ai?: ChromeAINamespace;
  };
  return (
    chromeWithAI.aiOriginTrial?.languageModel ?? chromeWithAI.ai?.languageModel
  );
}

/**
 * Check if Chrome Built-in AI is available.
 * Returns the availability status or null if the API doesn't exist.
 */
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

/**
 * Generate tags using Chrome's built-in Gemini Nano model.
 * Returns null if Chrome AI is not available or inference fails.
 */
export async function generateTagsWithChromeAI(
  title: string,
  content: string,
): Promise<string[] | null> {
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
      // Model needs to be downloaded first - skip for now, use WebLLM instead
      console.log(
        "[chrome-ai] Model requires download, falling back to WebLLM",
      );
      return null;
    }

    // Create a session and run inference
    const session = await api.create();
    const prompt = buildEnrichmentPrompt(title, content);

    try {
      const response = await session.prompt(prompt);
      console.log("[chrome-ai] Raw response:", response);

      const tags = parseEnrichmentResponse(response);
      if (tags && tags.length > 0) {
        console.log("[chrome-ai] Generated tags:", tags);
        return tags.slice(0, 5);
      }

      return null;
    } finally {
      // Clean up the session
      session.destroy();
    }
  } catch (err) {
    console.error("[chrome-ai] Inference failed:", err);
    return null;
  }
}
