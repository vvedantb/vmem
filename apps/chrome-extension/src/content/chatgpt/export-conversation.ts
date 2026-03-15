import { EXPORT_PROMPT } from "@/lib/constants";
import { waitForElement } from "@/content/shared/dom-utils";
import { createVmemButton } from "@/content/shared/inject-button";
import { SELECTORS } from "./selectors";

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(textarea, value);
  }
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function injectExportButton(): Promise<void> {
  const header = await waitForElement(SELECTORS.headerActions);
  if (!header) return;

  if (header.querySelector("[data-vmem]")) return;

  const button = createVmemButton("Export to vmem", () => {
    const textarea = document.querySelector(SELECTORS.textarea);
    if (textarea instanceof HTMLTextAreaElement) {
      setTextareaValue(textarea, EXPORT_PROMPT);
      textarea.focus();
    }
  });

  header.appendChild(button);
}
