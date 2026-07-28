// auto-search memories while typing, capture prompts, inject context on send

import { debounce } from "es-toolkit";
import type { ExtensionStorage } from "@/types/storage";
import { sendMessage } from "@/lib/messaging";
import {
  autoSearchEnabledItem,
  autoCaptureEnabledItem,
  defaultProfileIdItem,
} from "@/lib/storage";
import { formatMemoriesContext } from "./format-memories-context";
import { showToast } from "./toast";
import {
  showMemoryPanel,
  showMemoryPanelLoading,
  hideMemoryPanel,
  getIncludedMemories,
  clearMemories,
} from "./memory-panel";

export interface AIChatConfig {
  platform: "chatgpt" | "claude";
  inputSelector: string;
  sendButtonSelector: string;
  getInputText: (el: HTMLElement) => string;
  setInputText: (el: HTMLElement, text: string) => void;
}

type CachedSettings = Pick<
  ExtensionStorage,
  "autoSearchEnabled" | "autoCaptureEnabled" | "defaultProfileId"
>;

const SETTING_DEFAULTS: CachedSettings = {
  autoSearchEnabled: true,
  autoCaptureEnabled: false,
  defaultProfileId: "",
};

let initialized = false;

// AI-generated (Claude), prompt: "chatgpt claude auto search panel and send time context inject"
// Modified by me: dedupe capture and skip when context already prefixed
export function setupAIChatIntegration(config: AIChatConfig): void {
  if (initialized) return;
  initialized = true;

  let settings: CachedSettings = { ...SETTING_DEFAULTS };

  void Promise.all([
    autoSearchEnabledItem.getValue(),
    autoCaptureEnabledItem.getValue(),
    defaultProfileIdItem.getValue(),
  ]).then(([autoSearchEnabled, autoCaptureEnabled, defaultProfileId]) => {
    settings = { autoSearchEnabled, autoCaptureEnabled, defaultProfileId };
  });

  autoSearchEnabledItem.watch((autoSearchEnabled) => {
    settings.autoSearchEnabled = autoSearchEnabled;
    if (!autoSearchEnabled) hideMemoryPanel();
  });

  autoCaptureEnabledItem.watch((autoCaptureEnabled) => {
    settings.autoCaptureEnabled = autoCaptureEnabled;
  });

  defaultProfileIdItem.watch((defaultProfileId) => {
    settings.defaultProfileId = defaultProfileId;
  });

  function getInput(): HTMLElement | null {
    const el = document.querySelector(config.inputSelector);
    return el instanceof HTMLElement ? el : null;
  }

  let lastSearchQuery = "";

  async function searchMemories(
    query: string,
    anchor: HTMLElement,
  ): Promise<void> {
    showMemoryPanelLoading(anchor);

    try {
      const memories = await sendMessage("retrieveMemories", { query });
      if (memories.length > 0) {
        showMemoryPanel(memories, anchor);
      } else {
        hideMemoryPanel();
      }
    } catch {
      hideMemoryPanel();
    }
  }

  const debouncedSearch = debounce((text: string, input: HTMLElement) => {
    lastSearchQuery = text;
    void searchMemories(text, input);
  }, 800);

  function handleInputChange(): void {
    if (!settings.autoSearchEnabled) return;

    const input = getInput();
    if (!input) return;

    const text = config.getInputText(input).trim();

    if (text.length < 10 || text === lastSearchQuery) return;

    debouncedSearch(text, input);
  }

  let lastCapturedText = "";
  let lastCapturedTime = 0;

  function capturePrompt(text: string): void {
    if (!settings.autoCaptureEnabled) return;
    if (text.length < 20) return;

    const now = Date.now();
    if (text === lastCapturedText && now - lastCapturedTime < 5000) return;
    lastCapturedText = text;
    lastCapturedTime = now;

    void sendMessage("capturePrompt", {
      prompt: text,
      url: window.location.href,
      platform: config.platform,
      profileId: settings.defaultProfileId || undefined,
    })
      .then(() => {
        showToast({ type: "success", message: "Prompt saved to vmem" });
      })
      .catch(() => {
        // auto-capture must never disrupt the chat flow
      });
  }

  function handleSend(): void {
    const input = getInput();
    if (!input) return;

    const originalText = config.getInputText(input).trim();
    if (!originalText) return;

    const hasExistingContext = originalText.startsWith("[Context from vmem]");

    if (!hasExistingContext) {
      capturePrompt(originalText);
    }

    const included = getIncludedMemories();
    if (included.length > 0 && !hasExistingContext) {
      const context = formatMemoriesContext(included);
      config.setInputText(input, context + originalText);
    }

    // let the platform read the prefixed input before clearing panel state
    setTimeout(() => {
      clearMemories();
      lastSearchQuery = "";
    }, 200);
  }

  document.addEventListener("input", (e) => {
    const input = getInput();
    if (!input) return;
    const target = e.target instanceof Node ? e.target : null;
    if (target && (target === input || input.contains(target))) {
      handleInputChange();
    }
  });

  // capture phase runs before the platform send handler
  document.addEventListener(
    "click",
    (e) => {
      const sendBtn = document.querySelector(config.sendButtonSelector);
      if (!sendBtn) return;
      const target = e.target instanceof Node ? e.target : null;
      if (target && (target === sendBtn || sendBtn.contains(target))) {
        handleSend();
      }
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const input = getInput();
      if (!input) return;
      const target = e.target instanceof Node ? e.target : null;
      if (target && (target === input || input.contains(target))) {
        handleSend();
      }
    },
    true,
  );

  console.log(`[vmem] AI chat integration initialized for ${config.platform}`);
}
