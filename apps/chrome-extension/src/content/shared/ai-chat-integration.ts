/**
 * AI chat integration: auto-search memories + auto-capture prompts.
 * Works with ChatGPT and Claude via platform-specific config.
 *
 * Auto-search: debounced memory retrieval as user types → floating panel.
 * Auto-capture: saves the user's prompt to vmem on send.
 * On send: injects included memories as context prefix, then cleans up.
 */

import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import type { MemoryCandidate } from "@/types/api";
import { showToast } from "./toast";
import {
  showMemoryPanel,
  hideMemoryPanel,
  getIncludedMemories,
  clearMemories,
} from "./memory-panel";

// ── Config ───────────────────────────────────────────────────────────────────

export interface AIChatConfig {
  platform: "chatgpt" | "claude";
  inputSelector: string;
  sendButtonSelector: string;
  getInputText: (el: HTMLElement) => string;
  setInputText: (el: HTMLElement, text: string) => void;
}

// ── Cached settings (read once, kept in sync via storage listener) ───────────

interface CachedSettings {
  autoSearchEnabled: boolean;
  autoCaptureEnabled: boolean;
  defaultProfileId: string;
}

const SETTING_DEFAULTS: CachedSettings = {
  autoSearchEnabled: true,
  autoCaptureEnabled: false,
  defaultProfileId: "",
};

// ── Context formatting (matches existing "Use vmem" button format) ───────────

function formatMemoriesContext(mems: MemoryCandidate[]): string {
  const lines = mems.map((m) => `- ${m.title}: ${m.content.slice(0, 200)}`);
  return `[Context from vmem]\n${lines.join("\n")}\n\n`;
}

// ── Setup ────────────────────────────────────────────────────────────────────

let initialized = false;

/**
 * Call once per content script. Registers document-level listeners for
 * auto-search and auto-capture on the given AI chat platform.
 */
export function setupAIChatIntegration(config: AIChatConfig): void {
  // Guard against double-init (SPA re-injection)
  if (initialized) return;
  initialized = true;

  // ── Settings cache ─────────────────────────────────────────────────────

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
      // Hide panel when auto-search is turned off
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

  // ── Helpers ────────────────────────────────────────────────────────────

  function getInput(): HTMLElement | null {
    const el = document.querySelector(config.inputSelector);
    return el instanceof HTMLElement ? el : null;
  }

  // ── Auto-search ────────────────────────────────────────────────────────

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSearchQuery = "";

  function handleInputChange(): void {
    if (!settings.autoSearchEnabled) return;

    const input = getInput();
    if (!input) return;

    const text = config.getInputText(input).trim();

    // Skip short or unchanged queries
    if (text.length < 10 || text === lastSearchQuery) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      lastSearchQuery = text;
      searchMemories(text, input);
    }, 800);
  }

  function searchMemories(query: string, anchor: HTMLElement): void {
    const message: ContentMessage = { type: "RETRIEVE_MEMORIES", query };

    chrome.runtime.sendMessage(
      message,
      (response: BackgroundResponse | undefined) => {
        if (
          response?.type === "RETRIEVE_RESULT" &&
          response.memories.length > 0
        ) {
          showMemoryPanel(response.memories, anchor);
        } else {
          hideMemoryPanel();
        }
      },
    );
  }

  // ── Auto-capture ───────────────────────────────────────────────────────

  let lastCapturedText = "";
  let lastCapturedTime = 0;

  function capturePrompt(text: string): void {
    if (!settings.autoCaptureEnabled) return;
    if (text.length < 20) return;

    // Dedupe: skip identical text within 5 seconds
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

    chrome.runtime.sendMessage(
      message,
      (response: BackgroundResponse | undefined) => {
        if (response?.type === "SAVE_RESULT" && response.success) {
          showToast({ type: "success", message: "Prompt saved to vmem" });
        }
        // Silently ignore failures — auto-capture should never disrupt the user
      },
    );
  }

  // ── Send interception ──────────────────────────────────────────────────

  function handleSend(): void {
    const input = getInput();
    if (!input) return;

    const originalText = config.getInputText(input).trim();
    if (!originalText) return;

    // Skip if the input already contains injected context (e.g. from "Use vmem" button)
    const hasExistingContext = originalText.startsWith("[Context from vmem]");

    // 1. Capture the original prompt (before modification) — async, non-blocking
    if (!hasExistingContext) {
      capturePrompt(originalText);
    }

    // 2. Inject included memories as a context prefix (synchronous)
    const included = getIncludedMemories();
    if (included.length > 0 && !hasExistingContext) {
      const context = formatMemoriesContext(included);
      config.setInputText(input, context + originalText);
    }

    // 3. Clean up after a short delay (let the platform read the modified input)
    setTimeout(() => {
      clearMemories();
      lastSearchQuery = "";
    }, 200);
  }

  // ── Event listeners ────────────────────────────────────────────────────

  // Input monitoring for auto-search
  document.addEventListener("input", (e) => {
    const input = getInput();
    if (!input) return;
    const target = e.target instanceof Node ? e.target : null;
    if (target && (target === input || input.contains(target))) {
      handleInputChange();
    }
  });

  // Send button click — capture phase so we run before the platform's handler
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

  // Enter key in input — capture phase
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
