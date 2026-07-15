// public/icon-{dark,light}.svg copied from apps/web/public

export type VmemLogoVariant = "dark" | "light";

const LOGO_FILES: Record<VmemLogoVariant, string> = {
  dark: "icon-dark.svg",
  light: "icon-light.svg",
};

export function getVmemLogoUrl(variant: VmemLogoVariant): string {
  return chrome.runtime.getURL(LOGO_FILES[variant]);
}

export function createVmemLogoImg(
  variant: VmemLogoVariant,
  size: number,
): HTMLImageElement {
  const img = document.createElement("img");
  img.src = getVmemLogoUrl(variant);
  img.width = size;
  img.height = size;
  img.alt = "";
  img.draggable = false;
  img.setAttribute("aria-hidden", "true");
  return img;
}

export function mountVmemLogo(
  container: HTMLElement,
  variant: VmemLogoVariant,
  size: number,
): void {
  container.replaceChildren(createVmemLogoImg(variant, size));
}
