import { VMEM_BUTTON_STYLES } from "@/lib/constants";

export function createVmemButton(
  text: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = text;
  button.type = "button";
  button.setAttribute("data-vmem", "true");

  Object.assign(button.style, VMEM_BUTTON_STYLES);

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
    button.style.transform = "translateY(0)";
  });
  button.addEventListener("mouseup", () => {
    button.style.transform = "translateY(-2px)";
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
