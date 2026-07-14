import { VMEM_BUTTON_STYLES } from "@/lib/constants";
import { createVmemLogoImg } from "@/content/shared/icons";

let fontInjected = false;

const VMEM_LABEL_SELECTOR = "[data-vmem-label]";

/**
 * Updates button copy without removing the logo icon. Icon-only buttons have
 * no label span, so status text goes to the tooltip/aria-label instead.
 */
export function setVmemButtonLabel(
  button: HTMLButtonElement,
  text: string,
): void {
  const label = button.querySelector(VMEM_LABEL_SELECTOR);
  if (label) {
    label.textContent = text;
    return;
  }
  button.title = text;
  button.setAttribute("aria-label", text);
}

/**
 * Injects the Instrument Sans Google Font stylesheet into the host page.
 *
 * Idempotent — safe to call from any content script that renders text in
 * the host page (vs. inside a Shadow DOM, which doesn't see this link).
 */
export function injectInstrumentSansFont(): void {
  if (fontInjected) return;
  fontInjected = true;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}

export function createVmemButton(
  text: string,
  onClick: () => void,
  options?: { iconOnly?: boolean },
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("data-vmem", "true");

  const icon = document.createElement("span");
  icon.setAttribute("data-vmem-icon", "true");
  icon.appendChild(createVmemLogoImg("dark", 16));
  Object.assign(icon.style, {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: "0",
    lineHeight: "0",
  });

  if (options?.iconOnly) {
    // Circular icon-only variant: the text becomes the tooltip/aria-label
    button.append(icon);
    button.title = text;
    button.setAttribute("aria-label", text);
  } else {
    const label = document.createElement("span");
    label.setAttribute("data-vmem-label", "true");
    label.textContent = text;
    button.append(icon, label);
  }

  injectInstrumentSansFont();
  Object.assign(button.style, VMEM_BUTTON_STYLES);
  if (options?.iconOnly) {
    Object.assign(button.style, {
      width: "40px",
      padding: "0",
      borderRadius: "50%",
      justifyContent: "center",
    });
  }

  button.addEventListener("mouseenter", () => {
    button.style.transform = "translateY(-2px)";
    button.style.background = "rgba(235,235,238,0.92)";
    button.style.boxShadow =
      "0 1px 2px rgba(16,24,40,0.05), 0 16px 44px rgba(16,24,40,0.1)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.transform = "translateY(0)";
    button.style.background = "#ebebee";
    button.style.boxShadow =
      "0 1px 2px rgba(16,24,40,0.06), 0 10px 28px rgba(16,24,40,0.06)";
  });
  button.addEventListener("mousedown", () => {
    button.style.transform = "translateY(0) scale(0.96)";
  });
  button.addEventListener("mouseup", () => {
    button.style.transform = "translateY(-2px) scale(1)";
  });
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  return button;
}

export function removeExistingVmemButtons(): void {
  document.querySelectorAll("[data-vmem]").forEach((el) => el.remove());
}
