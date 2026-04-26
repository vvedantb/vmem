/**
 * YouTube content script
 * Adds a "Save to vmem" button to YouTube video pages that extracts the transcript
 */

import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { safeSendMessage } from "@/lib/safe-message";
import { injectInstrumentSansFont } from "@/content/shared/inject-button";

// ── State ─────────────────────────────────────────────────────────────────────

let currentVideoId: string | null = null;
let buttonInjected = false;

// ── SVG Icons ─────────────────────────────────────────────────────────────────

const VMEM_ICON = `<svg width="20" height="20" viewBox="0 0 210 204" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M81.3835 181.779C22.2397 161.586 13.4909 102.411 36.5078 61.7585L25.0687 36.241C-10.1246 81.7999 -19.3022 165.229 71.8802 203.249L81.3835 181.779Z" fill="currentColor"/>
  <path d="M128.109 181.779C187.253 161.586 196.002 102.411 172.985 61.7585L184.424 36.241C219.617 81.7999 228.795 165.229 137.612 203.249L128.109 181.779Z" fill="currentColor"/>
  <path d="M156.866 14.2622C115.857 -4.51398 93.2253 -4.72022 53.5056 13.461L63.1205 36.2163C92.2894 19.6073 110.744 19.1365 147.571 34.774L156.866 14.2622Z" fill="currentColor"/>
</svg>`;

// ── Video ID extraction ───────────────────────────────────────────────────────

function getVideoId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("v");
}

function getVideoTitle(): string {
  // Try multiple selectors for video title
  const titleEl =
    document.querySelector(
      "h1.ytd-video-primary-info-renderer yt-formatted-string",
    ) ||
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
    document.querySelector("#title h1 yt-formatted-string") ||
    document.querySelector("h1.title");
  return (
    titleEl?.textContent?.trim() || document.title.replace(" - YouTube", "")
  );
}

function getChannelName(): string {
  const channelEl =
    document.querySelector("#channel-name yt-formatted-string a") ||
    document.querySelector("ytd-channel-name yt-formatted-string") ||
    document.querySelector("#owner-name a");
  return channelEl?.textContent?.trim() || "Unknown Channel";
}

// ── Transcript extraction ─────────────────────────────────────────────────────

async function getTranscript(videoId: string): Promise<string | null> {
  try {
    // YouTube stores transcript data in the page - we need to fetch it
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();

    // Extract captions URL from the page data
    const captionsMatch = html.match(/"captions":\s*({[^}]+})/);
    if (!captionsMatch) {
      console.log("[vmem] No captions found in page data");
      return null;
    }

    // Try to find timedtext URL
    const timedTextMatch = html.match(/"baseUrl":\s*"([^"]*timedtext[^"]*)"/);
    if (!timedTextMatch || !timedTextMatch[1]) {
      console.log("[vmem] No timedtext URL found");
      return null;
    }

    // Decode the URL
    let timedTextUrl = timedTextMatch[1].replace(/\\u0026/g, "&");

    // Fetch the transcript
    const transcriptResponse = await fetch(timedTextUrl);
    const transcriptXml = await transcriptResponse.text();

    // Parse XML and extract text
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(transcriptXml, "text/xml");
    const textElements = xmlDoc.querySelectorAll("text");

    const transcriptParts: string[] = [];
    textElements.forEach((el) => {
      const text = el.textContent?.trim();
      if (text) {
        // Decode HTML entities
        const decoded = text
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n/g, " ");
        transcriptParts.push(decoded);
      }
    });

    return transcriptParts.join(" ");
  } catch (err) {
    console.error("[vmem] Failed to fetch transcript:", err);
    return null;
  }
}

// ── Button injection ──────────────────────────────────────────────────────────

function createSaveButton(): HTMLButtonElement {
  // Make sure Instrument Sans is loaded on the YouTube page before we
  // render the button; cheap + idempotent.
  injectInstrumentSansFont();

  const button = document.createElement("button");
  button.id = "vmem-youtube-save";
  button.title = "Save video to vmem";
  button.innerHTML = `${VMEM_ICON}<span>Save to vmem</span>`;

  // Button shape mirrors YouTube's chip style for visual fit, but the
  // typography stays on-brand with Instrument Sans.
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    margin-left: 8px;
    border: none;
    border-radius: 18px;
    background: var(--yt-spec-badge-chip-background, #f2f2f2);
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  `;

  button.addEventListener("mouseenter", () => {
    button.style.background =
      "var(--yt-spec-button-chip-background-hover, #e5e5e5)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.background = "var(--yt-spec-badge-chip-background, #f2f2f2)";
  });

  button.addEventListener("click", handleSaveClick);

  return button;
}

async function handleSaveClick(): Promise<void> {
  const button = document.getElementById(
    "vmem-youtube-save",
  ) as HTMLButtonElement;
  if (!button) return;

  const videoId = getVideoId();
  if (!videoId) {
    console.error("[vmem] No video ID found");
    return;
  }

  // Show loading state
  const originalContent = button.innerHTML;
  button.innerHTML = `<span style="opacity: 0.7;">Saving...</span>`;
  button.disabled = true;

  try {
    const title = getVideoTitle();
    const channel = getChannelName();
    const transcript = await getTranscript(videoId);

    const message: ContentMessage = {
      type: "SAVE_YOUTUBE_VIDEO",
      url: window.location.href,
      title,
      channel,
      transcript: transcript || "(No transcript available)",
    };

    safeSendMessage<BackgroundResponse>(message, (response) => {
      if (response?.type === "SAVE_RESULT" && response.success) {
        button.innerHTML = `<span style="color: #16a34a;">✓ Saved!</span>`;
        setTimeout(() => {
          button.innerHTML = originalContent;
          button.disabled = false;
        }, 2000);
      } else if (response?.type === "SAVE_DUPLICATE") {
        button.innerHTML = `<span style="color: #ca8a04;">Already saved</span>`;
        setTimeout(() => {
          button.innerHTML = originalContent;
          button.disabled = false;
        }, 2000);
      } else {
        button.innerHTML = `<span style="color: #dc2626;">Failed</span>`;
        setTimeout(() => {
          button.innerHTML = originalContent;
          button.disabled = false;
        }, 2000);
      }
    });
  } catch (err) {
    console.error("[vmem] Save failed:", err);
    button.innerHTML = `<span style="color: #dc2626;">Error</span>`;
    setTimeout(() => {
      button.innerHTML = originalContent;
      button.disabled = false;
    }, 2000);
  }
}

function injectButton(): void {
  // Don't inject if already present
  if (document.getElementById("vmem-youtube-save")) return;

  // Find YouTube's action buttons container
  const actionsContainer =
    document.querySelector("#actions #top-level-buttons-computed") ||
    document.querySelector("#menu-container #top-level-buttons-computed") ||
    document.querySelector("ytd-menu-renderer #top-level-buttons-computed");

  if (actionsContainer) {
    const button = createSaveButton();
    actionsContainer.appendChild(button);
    buttonInjected = true;
    console.log("[vmem] YouTube save button injected");
  }
}

function removeButton(): void {
  const button = document.getElementById("vmem-youtube-save");
  if (button) {
    button.remove();
    buttonInjected = false;
  }
}

// ── Navigation handling ───────────────────────────────────────────────────────

function handleNavigation(): void {
  const videoId = getVideoId();

  // If we're not on a video page, remove button
  if (!videoId) {
    if (buttonInjected) {
      removeButton();
    }
    currentVideoId = null;
    return;
  }

  // If video changed, remove old button
  if (videoId !== currentVideoId) {
    removeButton();
    currentVideoId = videoId;

    // Inject button after a short delay to let YouTube render
    setTimeout(injectButton, 1500);
  }
}

// ── Initialization ────────────────────────────────────────────────────────────

function init(): void {
  // Initial check
  handleNavigation();

  // YouTube is an SPA - watch for navigation events
  const observer = new MutationObserver(() => {
    const videoId = getVideoId();
    if (videoId !== currentVideoId) {
      handleNavigation();
    }

    // Also try to inject button if it's missing but we're on a video page
    if (videoId && !document.getElementById("vmem-youtube-save")) {
      injectButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also listen for YouTube's custom navigation events
  window.addEventListener("yt-navigate-finish", handleNavigation);
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
