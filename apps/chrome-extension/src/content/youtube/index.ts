/**
 * YouTube content script
 * Adds a "Save to vmem" button to YouTube video pages that extracts the transcript
 */

import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { safeSendMessage } from "@/lib/safe-message";
import { injectInstrumentSansFont } from "@/content/shared/inject-button";
import { createVmemLogoImg } from "@/content/shared/icons";

// ── State ─────────────────────────────────────────────────────────────────────

let currentVideoId: string | null = null;
let buttonInjected = false;

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
//
// YouTube gates raw caption endpoints behind a per-video proof-of-origin token
// minted by the page's BotGuard: `timedtext` URLs return an empty 200 without
// it, and the InnerTube transcript endpoints reject JSON replays (the page
// itself now sends an encrypted protobuf body). The only reliable path left is
// the one YouTube's own UI uses — programmatically open the "Show transcript"
// panel and read the rendered segments out of the DOM, then close the panel

/** Matches both the new view-model markup and the old polymer renderer. */
const SEGMENT_SELECTOR =
  "transcript-segment-view-model, ytd-transcript-segment-renderer";

function querySegments(): Element[] {
  return [...document.querySelectorAll(SEGMENT_SELECTOR)];
}

/**
 * Pull the caption text out of a rendered segment, excluding the timestamp
 * and its a11y duplicate ("0:07" / "7 seconds") that share the element.
 */
function segmentText(segment: Element): string {
  // New markup: <span role="text"> holds just the snippet
  // Old markup: yt-formatted-string.segment-text
  const snippet =
    segment.querySelector('span[role="text"]') ||
    segment.querySelector(".segment-text");
  return snippet?.textContent?.trim().replace(/\s+/g, " ") ?? "";
}

function waitForSegments(timeoutMs: number): Promise<Element[]> {
  return new Promise((resolve) => {
    const existing = querySegments();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const segments = querySegments();
      if (segments.length > 0) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(segments);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(querySegments());
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/** Best-effort: close the engagement panel we opened so the UI is undisturbed. */
function closeTranscriptPanel(segment: Element): void {
  const panel = segment.closest("ytd-engagement-panel-section-list-renderer");
  const closeButton =
    panel?.querySelector<HTMLButtonElement>("#visibility-button button") ||
    panel?.querySelector<HTMLButtonElement>('button[aria-label*="lose" i]');
  closeButton?.click();
}

async function getTranscript(): Promise<string | null> {
  try {
    // Segments already in the DOM means the user has the panel open — read
    // them directly and leave the panel alone
    const preexisting = querySegments();
    if (preexisting.length > 0) {
      return preexisting.map(segmentText).filter(Boolean).join(" ") || null;
    }

    // The "Show transcript" button only exists when the video has captions
    // .click() works even while the description is collapsed
    const openButton = document.querySelector<HTMLButtonElement>(
      "ytd-video-description-transcript-section-renderer button",
    );
    if (!openButton) {
      console.log("[vmem] No transcript button on this video");
      return null;
    }
    openButton.click();

    const segments = await waitForSegments(10000);
    if (segments.length === 0) {
      console.log("[vmem] Transcript panel opened but no segments rendered");
      return null;
    }
    const transcript = segments.map(segmentText).filter(Boolean).join(" ");
    const firstSegment = segments.at(0);
    if (firstSegment) {
      closeTranscriptPanel(firstSegment);
    }
    return transcript || null;
  } catch (err) {
    console.error("[vmem] Failed to extract transcript:", err);
    return null;
  }
}

// ── Button injection ──────────────────────────────────────────────────────────

function createSaveButton(): HTMLButtonElement {
  // Make sure Instrument Sans is loaded on the YouTube page before we
  // render the button; cheap + idempotent
  injectInstrumentSansFont();

  const button = document.createElement("button");
  button.id = "vmem-youtube-save";
  button.title = "Save video to vmem";
  const label = document.createElement("span");
  label.textContent = "Save to vmem";
  button.append(createVmemLogoImg("dark", 20), label);

  // Button shape mirrors YouTube's chip style for visual fit, but the
  // typography stays on-brand with Instrument Sans
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    margin-left: 8px;
    border: none;
    border-radius: 18px;
    background: var(--yt-spec-badge-chip-background, #f2f2f2);
    color: var(--yt-spec-text-accent, #0f0f0f);
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
  const buttonEl = document.getElementById("vmem-youtube-save");
  if (!(buttonEl instanceof HTMLButtonElement)) return;
  const button = buttonEl;

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
    const rawTranscript = await getTranscript();
    // Cap before sending — chrome.runtime messages have to round-trip through
    // structured-clone, and the backend slices to 10k anyway. Keeping a small
    // headroom lets the channel prefix fit in the final payload
    const transcript = rawTranscript
      ? rawTranscript.slice(0, 12000)
      : "(No transcript available)";

    const message: ContentMessage = {
      type: "SAVE_YOUTUBE_VIDEO",
      url: window.location.href,
      title,
      channel,
      transcript,
    };

    safeSendMessage<BackgroundResponse>(message, (response) => {
      if (response?.type === "SAVE_RESULT" && response.success) {
        button.innerHTML = `<span style="color: #16a34a;">✓ Saved!</span>`;
        button.title = "Save video to vmem";
      } else {
        // Surface the real reason: backend error message, or a generic note
        // when the response was dropped (extension reload, channel closed)
        const reason =
          response?.type === "SAVE_RESULT" && response.error
            ? response.error
            : response === undefined
              ? "Extension context unavailable — reload the page"
              : "Unknown error";
        console.error("[vmem] Save to vmem failed:", reason, response);
        button.innerHTML = `<span style="color: #dc2626;">Failed</span>`;
        button.title = `Save failed: ${reason}`;
      }
      setTimeout(() => {
        button.innerHTML = originalContent;
        button.title = "Save video to vmem";
        button.disabled = false;
      }, 2500);
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[vmem] Save failed:", err);
    button.innerHTML = `<span style="color: #dc2626;">Error</span>`;
    button.title = `Save failed: ${reason}`;
    setTimeout(() => {
      button.innerHTML = originalContent;
      button.title = "Save video to vmem";
      button.disabled = false;
    }, 2500);
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
