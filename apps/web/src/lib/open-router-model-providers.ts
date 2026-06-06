/**
 * OpenRouter provider slugs → brand assets (from https://svgl.app).
 * Slug is the segment before `/` in model ids (e.g. `google/gemma-3-27b-it:free`).
 */

export type OpenRouterProviderIconAsset =
  | { kind: "single"; src: string }
  | { kind: "theme"; light: string; dark: string };

const OPEN_ROUTER_PROVIDER_ICONS: Record<string, OpenRouterProviderIconAsset> =
  {
    google: { kind: "single", src: "/model-providers/google.svg" },
    "meta-llama": { kind: "single", src: "/model-providers/llama.svg" },
    qwen: {
      kind: "theme",
      light: "/model-providers/qwen.svg",
      dark: "/model-providers/qwen-dark.svg",
    },
    deepseek: { kind: "single", src: "/model-providers/deepseek.svg" },
    mistralai: { kind: "single", src: "/model-providers/mistral.svg" },
    microsoft: { kind: "single", src: "/model-providers/microsoft.svg" },
    nvidia: {
      kind: "theme",
      light: "/model-providers/nvidia-light.svg",
      dark: "/model-providers/nvidia-dark.svg",
    },
  };

export function getOpenRouterProviderIcon(
  openRouterSlug: string,
): OpenRouterProviderIconAsset | null {
  const icon = OPEN_ROUTER_PROVIDER_ICONS[openRouterSlug];
  if (icon === undefined) return null;
  return icon;
}
