// drag to select, crop visible tab capture, preview and save screenshot

import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { onMessage, sendMessage } from "@/lib/messaging";
import { errorMessage } from "@/lib/error";
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
  icon: string,
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
  // keep prior error tooltip when save fails
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

function selectionRectToDomRect(rect: SelectionRect): DOMRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.w,
    bottom: rect.y + rect.h,
    toJSON: () => ({}),
  };
}

async function positionPreview(rect: SelectionRect): Promise<void> {
  preview.classList.add("visible");

  const virtualEl = {
    getBoundingClientRect: () => selectionRectToDomRect(rect),
  };

  const { x, y } = await computePosition(virtualEl, preview, {
    placement: "bottom",
    strategy: "fixed",
    middleware: [offset(10), flip(), shift({ padding: 10 })],
  });

  preview.style.left = `${x}px`;
  preview.style.top = `${y}px`;
}

function showPreview(rect: SelectionRect, blob: Blob, dataUrl: string): void {
  croppedBlob = blob;
  thumb.src = dataUrl;
  void positionPreview(rect);
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

  if (finalRect.w < 8 || finalRect.h < 8) {
    setMode("idle");
    return;
  }

  void captureAndCrop(finalRect);
}

async function captureAndCrop(rect: SelectionRect): Promise<void> {
  // hide overlay so it is not captured in the png
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

  try {
    const base64Png = await blobToBase64(croppedBlob);
    await sendMessage("saveScreenshot", {
      base64Png,
      caption: captionValue.trim() || undefined,
      pageUrl: window.location.href,
      pageTitle: document.title,
    });
    setMode("success");
  } catch (err) {
    console.error(
      "[vmem] Screenshot save failed:",
      errorMessage(err),
      "— reload the page to reconnect.",
    );
    saveBtn.title = err instanceof Error ? err.message : "Save failed";
    setMode("error");
  }
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

onMessage("startScreenshot", (): { ok: true } => {
  startSelection();
  return { ok: true };
});

mountOverlay();
