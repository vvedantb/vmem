import { waitForElement } from "@/content/shared/dom-utils";
import {
  createVmemButton,
  setVmemButtonLabel,
} from "@/content/shared/inject-button";
import { SELECTORS } from "./selectors";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import type { MemoryCandidate } from "@/types/api";
import { safeSendMessage } from "@/lib/safe-message";

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

  const button = createVmemButton(
    "Use vmem",
    () => {
      const input = document.querySelector(SELECTORS.inputField);
      if (!(input instanceof HTMLElement)) return;

      const currentText = (input.textContent ?? "").trim();
      if (!currentText) {
        setVmemButtonLabel(button, "Type a message first");
        setTimeout(() => {
          setVmemButtonLabel(button, "Use vmem");
        }, 2000);
        return;
      }

      setVmemButtonLabel(button, "Loading...");
      button.style.opacity = "0.6";

      const message: ContentMessage = {
        type: "RETRIEVE_MEMORIES",
        query: currentText,
      };

      safeSendMessage<BackgroundResponse>(message, (response) => {
        setVmemButtonLabel(button, "Use vmem");
        button.style.opacity = "1";

        if (
          response?.type === "RETRIEVE_RESULT" &&
          response.memories.length > 0
        ) {
          const context = formatMemoriesContext(response.memories);
          setContentEditableValue(input, context + currentText);
          input.focus();
        } else {
          setVmemButtonLabel(button, "No memories found");
          setTimeout(() => {
            setVmemButtonLabel(button, "Use vmem");
          }, 2000);
        }
      });
    },
    { iconOnly: true },
  );

  button.style.marginTop = "4px";
  parent.appendChild(button);
}
