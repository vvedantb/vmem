import { observeUrlChanges } from "@/content/shared/dom-utils";
import { removeExistingVmemButtons } from "@/content/shared/inject-button";
import { setupAIChatIntegration } from "@/content/shared/ai-chat-integration";
import { injectExportButton } from "@/content/shared/inject-export";
import { injectUseVmemButton } from "@/content/shared/inject-use-vmem";
import {
  setInputText as applyInputText,
  type FocusPolicy,
} from "@/content/shared/set-input-text";

export interface AiChatPlatformSelectors {
  headerActions: string;
  inputField: string;
  sendButton: string;
}

export function bootstrapAiChatPlatform(options: {
  platform: "chatgpt" | "claude";
  selectors: AiChatPlatformSelectors;
  focus: FocusPolicy;
  injectCopyPromptButton?: () => Promise<void>;
}): void {
  const { platform, selectors, focus, injectCopyPromptButton } = options;

  async function injectButtons(): Promise<void> {
    removeExistingVmemButtons();
    const tasks: Array<Promise<void>> = [
      injectExportButton({
        headerSelector: selectors.headerActions,
        inputSelector: selectors.inputField,
        focus,
      }),
      injectUseVmemButton({
        inputSelector: selectors.inputField,
        focus,
      }),
    ];
    if (injectCopyPromptButton) {
      tasks.push(injectCopyPromptButton());
    }
    await Promise.all(tasks);
  }

  void injectButtons();

  observeUrlChanges(() => {
    setTimeout(() => void injectButtons(), 1000);
  });

  setupAIChatIntegration({
    platform,
    inputSelector: selectors.inputField,
    sendButtonSelector: selectors.sendButton,
    getInputText: (el) => (el.textContent ?? "").trim(),
    setInputText: (el, text) => applyInputText(el, text, focus),
  });
}
