import { waitForElement } from "@/content/shared/dom-utils";
import { createVmemButton } from "@/content/shared/inject-button";
import { SELECTORS } from "./selectors";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import type { MemoryCandidate } from "@/types/api";

function formatMemoriesContext(memories: MemoryCandidate[]): string {
  if (memories.length === 0) return "";

  const lines = memories.map((m) => `- ${m.title}: ${m.content.slice(0, 200)}`);

  return `[Context from vmem]\n${lines.join("\n")}\n\n`;
}

function setContentEditableValue(element: HTMLElement, value: string): void {
  element.textContent = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function injectUseVmemButton(): Promise<void> {
  const inputField = await waitForElement(SELECTORS.inputField);
  if (!inputField) return;

  const parent = inputField.parentElement;
  if (!parent || parent.querySelector("[data-vmem]")) return;

  const button = createVmemButton("Use vmem", () => {
    const input = document.querySelector(SELECTORS.inputField);
    if (!(input instanceof HTMLElement)) return;

    const currentText = (input.textContent ?? "").trim();
    if (!currentText) {
      button.textContent = "Type a message first";
      setTimeout(() => {
        button.textContent = "Use vmem";
      }, 2000);
      return;
    }

    button.textContent = "Loading...";
    button.style.opacity = "0.6";

    const message: ContentMessage = {
      type: "RETRIEVE_MEMORIES",
      query: currentText,
    };

    chrome.runtime.sendMessage(
      message,
      (response: BackgroundResponse | undefined) => {
        button.textContent = "Use vmem";
        button.style.opacity = "1";

        if (
          response?.type === "RETRIEVE_RESULT" &&
          response.memories.length > 0
        ) {
          const context = formatMemoriesContext(response.memories);
          setContentEditableValue(input, context + currentText);
          input.focus();
        } else {
          button.textContent = "No memories found";
          setTimeout(() => {
            button.textContent = "Use vmem";
          }, 2000);
        }
      },
    );
  });

  button.style.marginTop = "4px";
  parent.appendChild(button);
}
