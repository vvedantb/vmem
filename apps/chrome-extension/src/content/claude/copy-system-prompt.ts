import { waitForElement } from "@/content/shared/dom-utils";
import { createVmemButton } from "@/content/shared/inject-button";
import { copyVmemSystemPrompt } from "@/content/shared/copy-vmem-system-prompt";
import { SELECTORS } from "./selectors";

const COPY_ACTION = "copy-prompt";

export async function injectCopyPromptButton(): Promise<void> {
  const header = await waitForElement(SELECTORS.headerActions);
  if (!header) return;

  if (header.querySelector(`[data-vmem-action="${COPY_ACTION}"]`)) return;

  const button = createVmemButton("Copy vmem prompt", () => {
    copyVmemSystemPrompt();
  });

  button.setAttribute("data-vmem-action", COPY_ACTION);
  header.appendChild(button);
}
