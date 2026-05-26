/**
 * Local model provider brand assets (from https://svgl.app).
 * Llama → Meta; Gemma → Gemini (Google family, no dedicated Gemma mark on SVGL).
 */

export const LOCAL_MODEL_PROVIDERS = [
  "Qwen",
  "Llama",
  "DeepSeek",
  "Gemma",
] as const;

export type LocalModelProvider = (typeof LOCAL_MODEL_PROVIDERS)[number];

const PROVIDER_ICON_SRC: Record<LocalModelProvider, string> = {
  Qwen: "/model-providers/qwen.svg",
  Llama: "/model-providers/llama.svg",
  DeepSeek: "/model-providers/deepseek.svg",
  Gemma: "/model-providers/gemma.svg",
};

/** Qwen logos use `currentColor` — theme-specific files for `<img>` usage. */
const QWEN_THEME_ICONS = {
  light: "/model-providers/qwen.svg",
  dark: "/model-providers/qwen-dark.svg",
} as const;

function isLocalModelProvider(value: string): value is LocalModelProvider {
  for (const provider of LOCAL_MODEL_PROVIDERS) {
    if (provider === value) return true;
  }
  return false;
}

/** Icon path for a provider label, or null if unknown. */
export function getProviderIconSrc(provider: string): string | null {
  if (!isLocalModelProvider(provider)) return null;
  return PROVIDER_ICON_SRC[provider];
}

export function getQwenIconSrc(theme: "light" | "dark"): string {
  return QWEN_THEME_ICONS[theme];
}
