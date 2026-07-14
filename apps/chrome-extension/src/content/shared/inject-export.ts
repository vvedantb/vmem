import { EXPORT_PROMPT } from "@/lib/constants";
import { waitForElement } from "@/content/shared/dom-utils";
import { createVmemButton } from "@/content/shared/inject-button";
import {
  setInputText,
  type FocusPolicy,
} from "@/content/shared/set-input-text";

export async function injectExportButton(options: {
  headerSelector: string;
  inputSelector: string;
  focus: FocusPolicy;
}): Promise<void> {
  const header = await waitForElement(options.headerSelector);
  if (!header) return;

  if (header.querySelector("[data-vmem-action='export']")) return;

  const button = createVmemButton("Export to vmem", () => {
    const input = document.querySelector(options.inputSelector);
    if (input instanceof HTMLElement) {
      setInputText(input, EXPORT_PROMPT, options.focus);
    }
  });

  button.setAttribute("data-vmem-action", "export");
  header.appendChild(button);
}
