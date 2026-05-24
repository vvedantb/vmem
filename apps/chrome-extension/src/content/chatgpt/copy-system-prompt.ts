import {
  VMEM_AI_SYSTEM_PROMPT,
  VMEM_AI_SYSTEM_PROMPT_COPY_SUCCESS,
} from "@/lib/constants";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { createVmemButton } from "@/content/shared/inject-button";
import { showToast } from "@/content/shared/toast";

const COPY_ACTION = "copy-prompt";

function isPersonalizationSettingsPage(): boolean {
  return window.location.hash
    .toLowerCase()
    .includes("settings/personalization");
}

function findPersonalizationMount(): Element | null {
  for (const dialog of document.querySelectorAll('[role="dialog"]')) {
    const dialogText = dialog.textContent ?? "";
    if (!dialogText.includes("Custom instructions")) {
      continue;
    }

    for (const candidate of dialog.querySelectorAll("h1, h2, h3, div")) {
      const label = candidate.textContent?.trim() ?? "";
      if (label === "Custom instructions") {
        const section = candidate.parentElement;
        if (section) return section;
      }
    }

    const scrollContainer = dialog.querySelector(".overflow-y-auto");
    if (scrollContainer instanceof Element) {
      return scrollContainer;
    }

    return dialog;
  }

  return null;
}

function waitForPersonalizationMount(timeout = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = findPersonalizationMount();
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const mount = findPersonalizationMount();
      if (mount) {
        observer.disconnect();
        resolve(mount);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(findPersonalizationMount());
    }, timeout);
  });
}

export async function injectCopyPromptButton(): Promise<void> {
  if (!isPersonalizationSettingsPage()) return;
  if (document.querySelector(`[data-vmem-action="${COPY_ACTION}"]`)) return;

  const mount = await waitForPersonalizationMount();
  if (!mount) return;

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
  button.style.marginBottom = "12px";
  mount.insertBefore(button, mount.firstChild);
}
