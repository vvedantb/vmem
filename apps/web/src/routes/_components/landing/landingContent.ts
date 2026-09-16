export const VMEM_GITHUB_URL = "https://github.com/vvedantb/vmem";

export const LANDING_NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#recall", label: "Recall" },
  { href: "#how", label: "How it works" },
  { href: "#surfaces", label: "Surfaces" },
] as const;

export const LANDING_HERO_CAPABILITIES = [
  "Graph memory",
  "MCP",
  "HTTP API",
  "Skills",
] as const;

/** Gray fills for landing product mocks. Marketing chrome is monochrome. */
export const LANDING_MONO = {
  bright: "#d4d4d4",
  mid: "#a8a8a8",
  dim: "#7a7a7a",
} as const;
