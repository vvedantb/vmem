// ai chat integration: auto search memories + auto capture prompts
// works with chatgpt and claude via platform specific config
//
// auto search: debounced memory retrieval as user types → floating panel
// auto capture: saves the user's prompt to vmem on send
// on send: injects included memories as context prefix then cleans up

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

// config

export interface AIChatConfig {
  platform: "chatgpt" | "claude";
  inputSelector: string;
  sendButtonSelector: string;
  getInputText: (el: HTMLElement) => string;
  setInputText: (el: HTMLElement, text: string) => void;
}

// cached settings (read once kept in sync via storage listener)

type CachedSettings = Pick<
  ExtensionStorage,
  "autoSearchEnabled" | "autoCaptureEnabled" | "defaultProfileId"
>;

const SETTING_DEFAULTS: CachedSettings = {
  autoSearchEnabled: true,
  autoCaptureEnabled: false,
  defaultProfileId: "",
};

// setup

let initialized = false;

// call once per content script registers document level listeners for
// auto search and auto capture on the given ai chat platform
// AI-generated (Claude), prompt: "chatgpt claude auto search panel and send time context inject"
// Modified by me: dedupe capture and skip when context already prefixed
export function setupAIChatIntegration(config: AIChatConfig): void {
  // guard against double init (spa re injection)
  if (initialized) return;
  initialized = true;

  // settings cache

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

  // helpers

  function getInput(): HTMLElement | null {
    const el = document.querySelector(config.inputSelector);
    return el instanceof HTMLElement ? el : null;
  }

  // auto search

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

    // skip short or unchanged queries
    if (text.length < 10 || text === lastSearchQuery) return;

    debouncedSearch(text, input);
  }

  // auto capture

  let lastCapturedText = "";
  let lastCapturedTime = 0;

  function capturePrompt(text: string): void {
    if (!settings.autoCaptureEnabled) return;
    if (text.length < 20) return;

    // dedupe: skip identical text within 5 seconds
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
        // silently ignore failures auto capture should never disrupt the user
      });
  }

  // send interception

  function handleSend(): void {
    const input = getInput();
    if (!input) return;

    const originalText = config.getInputText(input).trim();
    if (!originalText) return;

    // skip if the input already contains injected context (e.g. from "Use vmem" button)
    const hasExistingContext = originalText.startsWith("[Context from vmem]");

    // 1. capture the original prompt (before modification) async non blocking
    if (!hasExistingContext) {
      capturePrompt(originalText);
    }

    // 2. inject included memories as a context prefix (synchronous)
    const included = getIncludedMemories();
    if (included.length > 0 && !hasExistingContext) {
      const context = formatMemoriesContext(included);
      config.setInputText(input, context + originalText);
    }

    // 3. clean up after a short delay (let the platform read the modified input)
    setTimeout(() => {
      clearMemories();
      lastSearchQuery = "";
    }, 200);
  }

  // event listeners

  // input monitoring for auto search
  document.addEventListener("input", (e) => {
    const input = getInput();
    if (!input) return;
    const target = e.target instanceof Node ? e.target : null;
    if (target && (target === input || input.contains(target))) {
      handleInputChange();
    }
  });

  // send button click capture phase so we run before the platform's handler
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

  // enter key in input capture phase
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
