// ai chat integration: auto search memories + auto capture prompts
// works with chatgpt and claude via platform specific config
//
// auto search: debounced memory retrieval as user types → floating panel
// auto capture: saves the user's prompt to vmem on send
// on send: injects included memories as context prefix then cleans up

import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import type { ExtensionStorage } from "@/types/storage";
import { safeSendMessage } from "@/lib/safe-message";
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

  chrome.storage.local.get(SETTING_DEFAULTS, (result) => {
    settings = {
      autoSearchEnabled: Boolean(result.autoSearchEnabled),
      autoCaptureEnabled: Boolean(result.autoCaptureEnabled),
      defaultProfileId: String(result.defaultProfileId ?? ""),
    };
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.autoSearchEnabled !== undefined) {
      settings.autoSearchEnabled = Boolean(changes.autoSearchEnabled.newValue);
      // hide panel when auto search is turned off
      if (!settings.autoSearchEnabled) hideMemoryPanel();
    }
    if (changes.autoCaptureEnabled !== undefined) {
      settings.autoCaptureEnabled = Boolean(
        changes.autoCaptureEnabled.newValue,
      );
    }
    if (changes.defaultProfileId !== undefined) {
      settings.defaultProfileId = String(
        changes.defaultProfileId.newValue ?? "",
      );
    }
  });

  // helpers

  function getInput(): HTMLElement | null {
    const el = document.querySelector(config.inputSelector);
    return el instanceof HTMLElement ? el : null;
  }

  // auto search

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSearchQuery = "";

  function handleInputChange(): void {
    if (!settings.autoSearchEnabled) return;

    const input = getInput();
    if (!input) return;

    const text = config.getInputText(input).trim();

    // skip short or unchanged queries
    if (text.length < 10 || text === lastSearchQuery) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      lastSearchQuery = text;
      searchMemories(text, input);
    }, 800);
  }

  function searchMemories(query: string, anchor: HTMLElement): void {
    showMemoryPanelLoading(anchor);

    const message: ContentMessage = { type: "RETRIEVE_MEMORIES", query };

    safeSendMessage<BackgroundResponse>(message, (response) => {
      if (
        response?.type === "RETRIEVE_RESULT" &&
        response.memories.length > 0
      ) {
        showMemoryPanel(response.memories, anchor);
      } else {
        hideMemoryPanel();
      }
    });
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

    const message: ContentMessage = {
      type: "CAPTURE_PROMPT",
      prompt: text,
      url: window.location.href,
      platform: config.platform,
      profileId: settings.defaultProfileId || undefined,
    };

    safeSendMessage<BackgroundResponse>(message, (response) => {
      if (response?.type === "SAVE_RESULT" && response.success) {
        showToast({ type: "success", message: "Prompt saved to vmem" });
      }
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
