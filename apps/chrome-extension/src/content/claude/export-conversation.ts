import { EXPORT_PROMPT } from "@/lib/constants";
import { waitForElement } from "@/content/shared/dom-utils";
import { createVmemButton } from "@/content/shared/inject-button";
import { SELECTORS } from "./selectors";

function setContentEditableValue(element: HTMLElement, value: string): void {
  element.textContent = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function injectExportButton(): Promise<void> {
  const header = await waitForElement(SELECTORS.headerActions);
  if (!header) return;

  if (header.querySelector("[data-vmem-action='export']")) return;

  const button = createVmemButton("Export to vmem", () => {
    const input = document.querySelector(SELECTORS.inputField);
    if (input instanceof HTMLElement) {
      setContentEditableValue(input, EXPORT_PROMPT);
      input.focus();
    }
  });

  button.setAttribute("data-vmem-action", "export");
  header.appendChild(button);
}
