// screenshot content script
//
// START_SCREENSHOT from the background sw mounts a dim overlay
// user drags a viewport rect → captureVisibleTab → dpr aware crop
// preview bar with caption + save → SAVE_SCREENSHOT
// esc cancels click outside preview dismisses

import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { safeSendMessage } from "@/lib/safe-message";
import { z } from "zod";
import { mountVmemLogo } from "@/content/shared/icons";
import { checkIcon, errorIcon } from "@/content/shared/status-icons";
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

const CHECK_ICON = checkIcon(14);
const ERROR_ICON = errorIcon(14);

const startScreenshotMessageSchema = z.object({
  type: z.literal("START_SCREENSHOT"),
});

let mode: Mode = "idle";
let dragStart: { x: number; y: number } | null = null;
let dragRect: SelectionRect | null = null;
let croppedBlob: Blob | null = null;
let captionValue = "";

function clearOverlay(): void {
  scrim.classList.remove("active");
  rectEl.classList.remove("active");
  preview.classList.remove("visible");
}

function resetSelectionState(): void {
  dragStart = null;
  dragRect = null;
  croppedBlob = null;
  captionValue = "";
  captionInput.value = "";
}

function setSaveButtonState(
  icon: "logo" | string,
  label: string,
  disabled: boolean,
  title?: string,
): void {
  if (icon === "logo") {
    mountVmemLogo(saveIcon, "dark", 14);
  } else {
    saveIcon.innerHTML = icon;
  }
  saveLabel.textContent = label;
  saveBtn.disabled = disabled;
  // omit title to preserve hover error text set before entering error mode
  if (title !== undefined) saveBtn.title = title;
}

function setMode(next: Mode): void {
  mode = next;
  preview.classList.remove("state-saving", "state-success", "state-error");

  switch (next) {
    case "idle":
      clearOverlay();
      resetSelectionState();
      setSaveButtonState("logo", "Save", false, "");
      break;
    case "selecting":
      clearOverlay();
      scrim.classList.add("active");
      break;
    case "preview":
      clearOverlay();
      preview.classList.add("visible");
      setSaveButtonState("logo", "Save", false, "");
      setTimeout(() => captionInput.focus(), 50);
      break;
    case "saving":
      preview.classList.add("state-saving");
      setSaveButtonState(`<div class="spinner"></div>`, "Saving", true);
      break;
    case "success":
      preview.classList.add("state-success");
      setSaveButtonState(CHECK_ICON, "Saved", true);
      setTimeout(() => {
        if (mode === "success") setMode("idle");
      }, 1400);
      break;
    case "error":
      preview.classList.add("state-error");
      setSaveButtonState(ERROR_ICON, "Failed", false);
      setTimeout(() => {
        if (mode === "error") setMode("idle");
      }, 2000);
      break;
  }
}

function positionRect(r: SelectionRect): void {
  rectEl.style.left = `${r.x}px`;
  rectEl.style.top = `${r.y}px`;
  rectEl.style.width = `${r.w}px`;
  rectEl.style.height = `${r.h}px`;
}

function positionPreview(rect: SelectionRect): void {
  // measure off screen first
  preview.style.left = "-9999px";
  preview.style.top = "-9999px";
  preview.classList.add("visible");
  const box = preview.getBoundingClientRect();
  preview.classList.remove("visible");

  const gap = 10;
  let x = rect.x + rect.w / 2 - box.width / 2;
  let y = rect.y + rect.h + gap;

  if (x + box.width > window.innerWidth - gap) {
    x = window.innerWidth - box.width - gap;
  }
  if (x < gap) x = gap;

  if (y + box.height > window.innerHeight - gap) {
    y = rect.y - box.height - gap;
  }
  if (y < gap) y = gap;

  preview.style.left = `${x}px`;
  preview.style.top = `${y}px`;
}

function showPreview(rect: SelectionRect, blob: Blob, dataUrl: string): void {
  croppedBlob = blob;
  thumb.src = dataUrl;
  positionPreview(rect);
  setMode("preview");
}

function onScrimMouseDown(e: MouseEvent): void {
  if (mode !== "selecting" || e.button !== 0) return;
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

  // reject tiny drags likely a stray click
  if (finalRect.w < 8 || finalRect.h < 8) {
    setMode("idle");
    return;
  }

  void captureAndCrop(finalRect);
}

async function captureAndCrop(rect: SelectionRect): Promise<void> {
  // hide overlay before capture so it is not in the png
  clearOverlay();
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
    showPreview(rect, cropped.blob, cropped.dataUrl);
  } catch (err) {
    console.error("[vmem] Crop failed:", err);
    setMode("idle");
  }
}

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
      saveBtn.title = "No response from background";
      setMode("error");
      return;
    }
    if (response.type === "SAVE_RESULT" && response.success) {
      setMode("success");
      return;
    }
    if (response.type === "SAVE_RESULT") {
      console.error(
        "[vmem] Screenshot save failed:",
        response.error ?? "(no error message)",
      );
      saveBtn.title = response.error ?? "Save failed";
      setMode("error");
      return;
    }
    console.error("[vmem] Screenshot save: unexpected response", response);
    saveBtn.title = "Unexpected response";
    setMode("error");
  });
}

function startSelection(): void {
  if (mode !== "idle") return;
  setMode("selecting");
}

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
    setMode("idle");
  }
  // stop the page from intercepting typing
  e.stopPropagation();
});

saveBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  void saveScreenshot();
});

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape" && mode !== "idle") {
      e.preventDefault();
      setMode("idle");
    }
  },
  true,
);

document.addEventListener(
  "mousedown",
  (e) => {
    if (mode !== "preview") return;
    if (e.target === host) return;
    setMode("idle");
  },
  true,
);

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    const parsed = startScreenshotMessageSchema.safeParse(message);
    if (!parsed.success) return false;
    startSelection();
    sendResponse({ ok: true });
    return true;
  },
);

mountOverlay();
