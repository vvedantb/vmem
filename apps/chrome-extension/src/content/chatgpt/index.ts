import { observeUrlChanges } from "@/content/shared/dom-utils";
import { removeExistingVmemButtons } from "@/content/shared/inject-button";
import { setupAIChatIntegration } from "@/content/shared/ai-chat-integration";
import { injectExportButton } from "./export-conversation";
import { injectCopyPromptButton } from "./copy-system-prompt";
import { injectUseVmemButton } from "./use-vmem";
import { SELECTORS } from "./selectors";

async function injectButtons(): Promise<void> {
  removeExistingVmemButtons();
  await Promise.all([
    injectExportButton(),
    injectCopyPromptButton(),
    injectUseVmemButton(),
  ]);
}

void injectButtons();

observeUrlChanges(() => {
  setTimeout(() => void injectButtons(), 1000);
});

// Auto-search + auto-capture (registered once, persists across SPA navigations)
setupAIChatIntegration({
  platform: "chatgpt",
  inputSelector: SELECTORS.inputField,
  sendButtonSelector: SELECTORS.sendButton,
  getInputText: (el) => (el.textContent ?? "").trim(),
  setInputText: (el, text) => {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  },
});
