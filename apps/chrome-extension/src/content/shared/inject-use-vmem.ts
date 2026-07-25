import { waitForElement } from "@/content/shared/dom-utils";
import {
  createVmemButton,
  setVmemButtonLabel,
} from "@/content/shared/inject-button";
import { formatMemoriesContext } from "@/content/shared/format-memories-context";
import {
  setInputText,
  type FocusPolicy,
} from "@/content/shared/set-input-text";
import { sendMessage } from "@/lib/messaging";

export async function injectUseVmemButton(options: {
  inputSelector: string;
  focus: FocusPolicy;
}): Promise<void> {
  const inputField = await waitForElement(options.inputSelector);
  if (!inputField) return;

  const parent = inputField.parentElement;
  if (!parent || parent.querySelector("[data-vmem]")) return;

  const button = createVmemButton(
    "Use vmem",
    () => {
      const input = document.querySelector(options.inputSelector);
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

      void sendMessage("retrieveMemories", { query: currentText })
        .then((memories) => {
          setVmemButtonLabel(button, "Use vmem");
          button.style.opacity = "1";

          if (memories.length > 0) {
            const context = formatMemoriesContext(memories);
            setInputText(input, context + currentText, options.focus);
          } else {
            setVmemButtonLabel(button, "No memories found");
            setTimeout(() => {
              setVmemButtonLabel(button, "Use vmem");
            }, 2000);
          }
        })
        .catch((err: unknown) => {
          console.warn(
            "[vmem] retrieveMemories failed:",
            err instanceof Error ? err.message : String(err),
            "— reload the page to reconnect.",
          );
          setVmemButtonLabel(button, "Use vmem");
          button.style.opacity = "1";
        });
    },
    { iconOnly: true },
  );

  button.style.marginTop = "4px";
  parent.appendChild(button);
}
