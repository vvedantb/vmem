/**
 * Screenshot content script.
 *
 * Listens for a `START_SCREENSHOT` runtime message (sent by the
 * background SW when the user invokes the toolbar action or the
 * keyboard shortcut). When triggered:
 *
 *   1. Mounts a dim overlay + crosshair on the page (Shadow DOM, so
 *      page styles can't bleed in).
 *   2. User drags a rectangle on the visible viewport.
 *   3. On mouseup, asks the background to `captureVisibleTab` and
 *      crops the returned PNG to the dragged rect on an OffscreenCanvas
 *      (devicePixelRatio aware).
 *   4. Shows a floating bar with thumbnail preview, optional caption,
 *      and a Save button - matching the selection popup's visual
 *      language. Save → SAVE_SCREENSHOT message.
 *
 * Esc cancels at any stage. Click outside the preview bar dismisses.
 *
 * File layout (all under `./screenshot/`):
 *   - `icons.ts`    - inline SVG strings
 *   - `styles.ts`   - shadow-DOM CSS
 *   - `types.ts`    - Mode + SelectionRect + CroppedImage
 *   - `dom.ts`      - element construction (singleton tree, mountOverlay)
 *   - `capture.ts`  - requestCapture + cropImage + blobToBase64
 *   - `index.ts`    - state machine + drag/save handlers + event wiring
 */

import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { safeSendMessage } from "@/lib/safe-message";
import { mountVmemLogo } from "@/content/shared/icons";
import { CHECK_ICON, ERROR_ICON } from "./icons";
import type { Mode, SelectionRect } from "./types";
import { blobToBase64, cropImage, requestCapture } from "./capture";
import {
  captionInput,
  host,
  mountOverlay,
  preview,
  rectEl,
  saveBtn,
  saveIcon,
  saveLabel,
  scrim,
  thumb,
} from "./dom";

// ── Mode + state ──────────────────────────────────────────────────────────────

let mode: Mode = "idle";
let dragStart: { x: number; y: number } | null = null;
let dragRect: SelectionRect | null = null;
let croppedBlob: Blob | null = null;
let captionValue = "";

// Surfaced as the Save button's `title` attribute when the save fails,
// so the user can hover the button to see the underlying error without
// hunting through the SW console.
function setLastErrorTitle(message: string): void {
  saveBtn.title = message;
}

// ── State transitions ─────────────────────────────────────────────────────────

function setMode(next: Mode): void {
  mode = next;
  preview.classList.remove("state-saving", "state-success", "state-error");
  switch (next) {
    case "idle":
      scrim.classList.remove("active");
      rectEl.classList.remove("active");
      preview.classList.remove("visible");
      dragStart = null;
      dragRect = null;
      croppedBlob = null;
      captionValue = "";
      captionInput.value = "";
      mountVmemLogo(saveIcon, "dark", 14);
      saveLabel.textContent = "Save";
      saveBtn.disabled = false;
      saveBtn.title = "";
      break;
    case "selecting":
      scrim.classList.add("active");
      rectEl.classList.remove("active");
      preview.classList.remove("visible");
      break;
    case "preview":
      scrim.classList.remove("active");
      rectEl.classList.remove("active");
      preview.classList.add("visible");
      mountVmemLogo(saveIcon, "dark", 14);
      saveLabel.textContent = "Save";
      saveBtn.disabled = false;
      // Focus caption input after the popup transitions in
      setTimeout(() => captionInput.focus(), 50);
      break;
    case "saving":
      preview.classList.add("state-saving");
      saveIcon.innerHTML = `<div class="spinner"></div>`;
      saveLabel.textContent = "Saving";
      saveBtn.disabled = true;
      break;
    case "success":
      preview.classList.add("state-success");
      saveIcon.innerHTML = CHECK_ICON;
      saveLabel.textContent = "Saved";
      saveBtn.disabled = true;
      setTimeout(() => {
        if (mode === "success") setMode("idle");
      }, 1400);
      break;
    case "error":
      preview.classList.add("state-error");
      saveIcon.innerHTML = ERROR_ICON;
      saveLabel.textContent = "Failed";
      saveBtn.disabled = false;
      setTimeout(() => {
        if (mode === "error") setMode("idle");
      }, 2000);
      break;
  }
}

// ── Drag handling ─────────────────────────────────────────────────────────────

function onScrimMouseDown(e: MouseEvent): void {
  if (mode !== "selecting") return;
  if (e.button !== 0) return;
  e.preventDefault();
  dragStart = { x: e.clientX, y: e.clientY };
  dragRect = { x: e.clientX, y: e.clientY, w: 0, h: 0 };
  rectEl.classList.add("active");
  positionRect(dragRect);
}

function onScrimMouseMove(e: MouseEvent): void {
  if (mode !== "selecting" || !dragStart) return;
  const x = Math.min(e.clientX, dragStart.x);
  const y = Math.min(e.clientY, dragStart.y);
  const w = Math.abs(e.clientX - dragStart.x);
  const h = Math.abs(e.clientY - dragStart.y);
  dragRect = { x, y, w, h };
  positionRect(dragRect);
}

function onScrimMouseUp(e: MouseEvent): void {
  if (mode !== "selecting" || !dragStart || !dragRect) return;
  e.preventDefault();
  const finalRect = dragRect;
  dragStart = null;

  // Reject tiny drags - likely a stray click.
  if (finalRect.w < 8 || finalRect.h < 8) {
    setMode("idle");
    return;
  }

  void captureAndCrop(finalRect);
}

function positionRect(r: SelectionRect): void {
  rectEl.style.left = `${r.x}px`;
  rectEl.style.top = `${r.y}px`;
  rectEl.style.width = `${r.w}px`;
  rectEl.style.height = `${r.h}px`;
}

// ── Capture + crop pipeline ───────────────────────────────────────────────────

async function captureAndCrop(rect: SelectionRect): Promise<void> {
  // Hide the scrim *before* asking the SW to capture - otherwise the
  // captured image will include our dim overlay.
  scrim.classList.remove("active");
  rectEl.classList.remove("active");

  // Yield a frame so the browser actually paints without the scrim.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  let dataUrl: string;
  try {
    dataUrl = await requestCapture();
  } catch (err) {
    console.error("[vmem] Capture failed:", err);
    setMode("idle");
    return;
  }

  try {
    const cropped = await cropImage(dataUrl, rect);
    croppedBlob = cropped.blob;
    thumb.src = cropped.dataUrl;
    positionPreview(rect);
    setMode("preview");
  } catch (err) {
    console.error("[vmem] Crop failed:", err);
    setMode("idle");
  }
}

// ── Preview positioning ───────────────────────────────────────────────────────

function positionPreview(rect: SelectionRect): void {
  // Render off-screen first so we can measure.
  preview.style.left = "-9999px";
  preview.style.top = "-9999px";
  preview.classList.add("visible");
  const rectBox = preview.getBoundingClientRect();
  preview.classList.remove("visible");

  const gap = 10;
  let x = rect.x + rect.w / 2 - rectBox.width / 2;
  let y = rect.y + rect.h + gap;

  if (x + rectBox.width > window.innerWidth - gap) {
    x = window.innerWidth - rectBox.width - gap;
  }
  if (x < gap) x = gap;

  if (y + rectBox.height > window.innerHeight - gap) {
    y = rect.y - rectBox.height - gap;
  }
  if (y < gap) y = gap;

  preview.style.left = `${x}px`;
  preview.style.top = `${y}px`;
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveScreenshot(): Promise<void> {
  if (mode !== "preview" && mode !== "error") return;
  if (!croppedBlob) return;

  setMode("saving");

  const base64Png = await blobToBase64(croppedBlob);

  const message: ContentMessage = {
    type: "SAVE_SCREENSHOT",
    base64Png,
    caption: captionValue.trim() || undefined,
    pageUrl: window.location.href,
    pageTitle: document.title,
  };

  safeSendMessage<BackgroundResponse>(message, (response) => {
    if (!response) {
      console.error(
        "[vmem] Screenshot save: no response from background (extension context lost or SW killed mid-request). " +
          "Open the service worker console (chrome://extensions → service worker) for backend errors.",
      );
      setLastErrorTitle("No response from background");
      setMode("error");
      return;
    }
    if (response.type === "SAVE_RESULT" && response.success) {
      setMode("success");
    } else if (response.type === "SAVE_DUPLICATE") {
      setMode("success");
    } else if (response.type === "SAVE_RESULT") {
      console.error(
        "[vmem] Screenshot save failed:",
        response.error ?? "(no error message)",
      );
      setLastErrorTitle(response.error ?? "Save failed");
      setMode("error");
    } else {
      console.error("[vmem] Screenshot save: unexpected response", response);
      setLastErrorTitle("Unexpected response");
      setMode("error");
    }
  });
}

// ── Trigger ───────────────────────────────────────────────────────────────────

function startSelection(): void {
  if (mode !== "idle") return;
  setMode("selecting");
}

function cancelAll(): void {
  setMode("idle");
}

// ── Event wiring ──────────────────────────────────────────────────────────────

scrim.addEventListener("mousedown", onScrimMouseDown);
scrim.addEventListener("mousemove", onScrimMouseMove);
scrim.addEventListener("mouseup", onScrimMouseUp);

captionInput.addEventListener("input", () => {
  captionValue = captionInput.value;
});
captionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    void saveScreenshot();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelAll();
  }
  // Stop the page from intercepting typing (some sites bind global keys).
  e.stopPropagation();
});

saveBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  void saveScreenshot();
});

// Global Esc - cancel from any state.
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape" && mode !== "idle") {
      e.preventDefault();
      cancelAll();
    }
  },
  true,
);

// Click outside preview while in preview state → dismiss without saving.
document.addEventListener(
  "mousedown",
  (e) => {
    if (mode !== "preview") return;
    if (e.target === host) return;
    cancelAll();
  },
  true,
);

// Listen for the start trigger from the background SW.
chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (
      typeof message === "object" &&
      message !== null &&
      Reflect.get(message, "type") === "START_SCREENSHOT"
    ) {
      startSelection();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  },
);

mountOverlay();
