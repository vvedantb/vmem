// youtube content script
// adds a "Save to vmem" button to youtube video pages that extracts the transcript

import { sendMessage } from "@/lib/messaging";
import { injectInstrumentSansFont } from "@/content/shared/inject-button";
import { createVmemLogoImg } from "@/content/shared/icons";
import { onDocumentReady, waitForProbe } from "@/content/shared/dom-utils";
import { errorMessage } from "@/lib/error";

// state

let currentVideoId: string | null = null;
let buttonInjected = false;

// video id extraction

function getVideoId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("v");
}

function getVideoTitle(): string {
  // try multiple selectors for video title
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

// transcript extraction
//
// youtube gates raw caption endpoints behind a per video proof of origin token
// minted by the page's BotGuard: `timedtext` URLs return an empty 200 without
// it and the InnerTube transcript endpoints reject JSON replays (the page
// itself now sends an encrypted protobuf body) the only reliable path left is
// the one youtube's own ui uses programmatically open the "Show transcript"
// panel and read the rendered segments out of the DOM then close the panel

// matches both the new view model markup and the old polymer renderer
const SEGMENT_SELECTOR =
  "transcript-segment-view-model, ytd-transcript-segment-renderer";

function querySegments(): Element[] {
  return [...document.querySelectorAll(SEGMENT_SELECTOR)];
}

// pull the caption text out of a rendered segment excluding the timestamp
// and its a11y duplicate ("0:07" / "7 seconds") that share the element
function segmentText(segment: Element): string {
  // new markup: <span role="text"> holds just the snippet
  // old markup: yt-formatted-string.segment-text
  const snippet =
    segment.querySelector('span[role="text"]') ||
    segment.querySelector(".segment-text");
  return snippet?.textContent?.trim().replace(/\s+/g, " ") ?? "";
}

function waitForSegments(timeoutMs: number): Promise<Element[]> {
  return waitForProbe(() => {
    const segments = querySegments();
    return segments.length > 0 ? segments : null;
  }, timeoutMs).then((segments) => segments ?? []);
}

// best effort: close the engagement panel we opened so the ui is undisturbed
function closeTranscriptPanel(segment: Element): void {
  const panel = segment.closest("ytd-engagement-panel-section-list-renderer");
  const closeButton =
    panel?.querySelector<HTMLButtonElement>("#visibility-button button") ||
    panel?.querySelector<HTMLButtonElement>('button[aria-label*="lose" i]');
  closeButton?.click();
}

async function getTranscript(): Promise<string | null> {
  try {
    // segments already in the DOM means the user has the panel open read
    // them directly and leave the panel alone
    const preexisting = querySegments();
    if (preexisting.length > 0) {
      return preexisting.map(segmentText).filter(Boolean).join(" ") || null;
    }

    // the "Show transcript" button only exists when the video has captions
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

// button injection

function createSaveButton(): HTMLButtonElement {
  // make sure instrument sans is loaded on the youtube page before we
  // render the button cheap + idempotent
  injectInstrumentSansFont();

  const button = document.createElement("button");
  button.id = "vmem-youtube-save";
  button.title = "Save video to vmem";
  const label = document.createElement("span");
  label.textContent = "Save to vmem";
  button.append(createVmemLogoImg("dark", 20), label);

  // button shape mirrors youtube's chip style for visual fit but the
  // typography stays on brand with instrument sans
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

  // show loading state
  const originalContent = button.innerHTML;
  button.innerHTML = `<span style="opacity: 0.7;">Saving...</span>`;
  button.disabled = true;

  try {
    const title = getVideoTitle();
    const channel = getChannelName();
    const rawTranscript = await getTranscript();
    // cap before sending chrome.runtime messages have to round trip through
    // structured clone and the backend slices to 10k anyway keeping a small
    // headroom lets the channel prefix fit in the final payload
    const transcript = rawTranscript
      ? rawTranscript.slice(0, 12000)
      : "(No transcript available)";

    await sendMessage("saveYoutubeVideo", {
      url: window.location.href,
      title,
      channel,
      transcript,
    });
    button.innerHTML = `<span style="color: #16a34a;">✓ Saved!</span>`;
    button.title = "Save video to vmem";
  } catch (err) {
    const reason = errorMessage(err);
    console.error("[vmem] Save to vmem failed:", reason);
    button.innerHTML = `<span style="color: #dc2626;">Failed</span>`;
    button.title = `Save failed: ${reason}`;
  }

  setTimeout(() => {
    button.innerHTML = originalContent;
    button.title = "Save video to vmem";
    button.disabled = false;
  }, 2500);
}

function injectButton(): void {
  // don't inject if already present
  if (document.getElementById("vmem-youtube-save")) return;

  // find youtube's action buttons container
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

// navigation handling

function handleNavigation(): void {
  const videoId = getVideoId();

  // if we're not on a video page, remove button
  if (!videoId) {
    if (buttonInjected) {
      removeButton();
    }
    currentVideoId = null;
    return;
  }

  // if video changed, remove old button
  if (videoId !== currentVideoId) {
    removeButton();
    currentVideoId = videoId;

    // inject button after a short delay to let youtube render
    setTimeout(injectButton, 1500);
  }
}

// initialisation

function init(): void {
  // initial check
  handleNavigation();

  // youtube is an spa watch for navigation events
  const observer = new MutationObserver(() => {
    const videoId = getVideoId();
    if (videoId !== currentVideoId) {
      handleNavigation();
    }

    // also try to inject button if it's missing but we're on a video page
    if (videoId && !document.getElementById("vmem-youtube-save")) {
      injectButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // also listen for youtube's custom navigation events
  window.addEventListener("yt-navigate-finish", handleNavigation);
}

onDocumentReady(init);
