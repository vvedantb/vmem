import {
  VMEM_AI_SYSTEM_PROMPT,
  VMEM_AI_SYSTEM_PROMPT_COPY_SUCCESS,
} from "@/lib/constants";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { waitForElement } from "@/content/shared/dom-utils";
import { createVmemButton } from "@/content/shared/inject-button";
import { showToast } from "@/content/shared/toast";
import { SELECTORS } from "./selectors";

const COPY_ACTION = "copy-prompt";

export async function injectCopyPromptButton(): Promise<void> {
  const header = await waitForElement(SELECTORS.headerActions);
  if (!header) return;

  if (header.querySelector(`[data-vmem-action="${COPY_ACTION}"]`)) return;

  const button = createVmemButton("Copy vmem prompt", () => {
    void copyTextToClipboard(VMEM_AI_SYSTEM_PROMPT).then((copied) => {
      if (copied) {
        showToast({
          type: "success",
          message: VMEM_AI_SYSTEM_PROMPT_COPY_SUCCESS,
        });
      } else {
        showToast({
          type: "error",
          message: "Could not copy to clipboard",
        });
      }
    });
  });

  button.setAttribute("data-vmem-action", COPY_ACTION);
  header.appendChild(button);
}
