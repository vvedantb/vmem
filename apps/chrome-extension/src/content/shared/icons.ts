import { appMarkSvg } from "@vvedantb/ui/brand";

export type VmemLogoVariant = "dark" | "light";

const LOGO_COLORS: Record<VmemLogoVariant, string> = {
  dark: "#000",
  light: "#fff",
};

// inline package mark, no web_accessible_resources file for pages to probe
export function createVmemLogo(
  variant: VmemLogoVariant,
  size: number,
): Element {
  const color = LOGO_COLORS[variant];
  const template = document.createElement("template");
  template.innerHTML = appMarkSvg("vmem", color);
  const svg = template.content.firstElementChild;
  if (!svg) throw new Error("vmem logo svg did not parse");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  // inline style so host page svg rules cannot fill the stroke-only mark
  svg.setAttribute("style", `fill: none; stroke: ${color}; flex-shrink: 0`);
  return svg;
}

export function mountVmemLogo(
  container: HTMLElement,
  variant: VmemLogoVariant,
  size: number,
): void {
  container.replaceChildren(createVmemLogo(variant, size));
}
