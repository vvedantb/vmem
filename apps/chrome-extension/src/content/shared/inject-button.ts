import { VMEM_BUTTON_STYLES } from "@/lib/constants";

export function createVmemButton(
  text: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = text;
  button.setAttribute("data-vmem", "true");

  Object.assign(button.style, VMEM_BUTTON_STYLES);

  button.addEventListener("mouseenter", () => {
    button.style.opacity = "0.9";
  });
  button.addEventListener("mouseleave", () => {
    button.style.opacity = "1";
  });
  button.addEventListener("click", onClick);

  return button;
}

export function removeExistingVmemButtons(): void {
  document.querySelectorAll("[data-vmem]").forEach((el) => el.remove());
}
