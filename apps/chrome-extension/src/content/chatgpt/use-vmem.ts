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

export async function injectUseVmemButton(): Promise<void> {
  const textareaContainer = await waitForElement(SELECTORS.textarea);
  if (!textareaContainer) return;

  const parent = textareaContainer.parentElement;
  if (!parent || parent.querySelector("[data-vmem]")) return;

  const button = createVmemButton("Use vmem", () => {
    const textarea = document.querySelector(SELECTORS.textarea);
    if (!(textarea instanceof HTMLTextAreaElement)) return;

    const currentText = textarea.value.trim();
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
          setTextareaValue(textarea, context + currentText);
          textarea.focus();
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
