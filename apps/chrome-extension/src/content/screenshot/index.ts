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
 *      and a Save button — matching the selection popup's visual
 *      language. Save → SAVE_SCREENSHOT message.
 *
 * Esc cancels at any stage. Click outside the preview bar dismisses.
 */

import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { safeSendMessage } from "@/lib/safe-message";

// ── Icons ─────────────────────────────────────────────────────────────────────

const VMEM_ICON = `<svg width="14" height="14" viewBox="0 0 210 204" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M81.3835 181.779C22.2397 161.586 13.4909 102.411 36.5078 61.7585L25.0687 36.241C-10.1246 81.7999 -19.3022 165.229 71.8802 203.249L81.3835 181.779Z" fill="currentColor"/>
  <path d="M128.109 181.779C187.253 161.586 196.002 102.411 172.985 61.7585L184.424 36.241C219.617 81.7999 228.795 165.229 137.612 203.249L128.109 181.779Z" fill="currentColor"/>
  <path d="M156.866 14.2622C115.857 -4.51398 93.2253 -4.72022 53.5056 13.461L63.1205 36.2163C92.2894 19.6073 110.744 19.1365 147.571 34.774L156.866 14.2622Z" fill="currentColor"/>
</svg>`;

const CHECK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

const ERROR_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

// ── Mode + state ──────────────────────────────────────────────────────────────

type Mode = "idle" | "selecting" | "preview" | "saving" | "success" | "error";

interface SelectionRect {
  // CSS pixels relative to the viewport.
  x: number;
  y: number;
  w: number;
  h: number;
}

let mode: Mode = "idle";
let dragStart: { x: number; y: number } | null = null;
let dragRect: SelectionRect | null = null;
let croppedBlob: Blob | null = null;
let croppedDataUrl: string | null = null;
let captionValue = "";

// Surfaced as the Save button's `title` attribute when the save fails,
// so the user can hover the button to see the underlying error without
// hunting through the SW console.
function setLastErrorTitle(message: string): void {
  saveBtn.title = message;
}

// ── Shadow DOM host ───────────────────────────────────────────────────────────

const host = document.createElement("vmem-screenshot-overlay");
host.setAttribute("data-vmem-screenshot", "true");
Object.assign(host.style, {
  position: "fixed",
  top: "0",
  left: "0",
  width: "0",
  height: "0",
  overflow: "visible",
  zIndex: "2147483647",
  pointerEvents: "none",
});

const shadow = host.attachShadow({ mode: "closed" });

const styleEl = document.createElement("style");
styleEl.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap');

  :host { all: initial; }

  /* Full-viewport scrim shown during the drag. Uses inset:0 with fixed
     positioning so we cover the visible area exactly. */
  #scrim {
    position: fixed;
    inset: 0;
    background: rgba(15, 15, 18, 0.35);
    cursor: crosshair;
    pointer-events: auto;
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    user-select: none;
    -webkit-user-select: none;
    display: none;
  }
  #scrim.active { display: block; }

  /* Hint pill telling the user what to do. Centred at top. */
  #hint {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(24, 24, 28, 0.92);
    color: #e4e4e7;
    padding: 8px 14px;
    border-radius: 99px;
    font-size: 13px;
    font-weight: 500;
    pointer-events: none;
    backdrop-filter: blur(8px);
  }

  /* The selection rectangle. Drawn with a punched-out look using a thick
     box-shadow that covers the rest of the scrim — the rect itself stays
     transparent so the user sees what they're cropping. */
  #rect {
    position: fixed;
    border: 1.5px solid #ffffff;
    box-shadow: 0 0 0 9999px rgba(15, 15, 18, 0.4);
    pointer-events: none;
    display: none;
  }
  #rect.active { display: block; }

  /* Preview popup. Same visual language as selection popup but pill-shaped
     and wider to fit thumbnail + input + Save. */
  #preview {
    position: fixed;
    display: none;
    align-items: center;
    gap: 10px;
    pointer-events: auto;
    box-sizing: border-box;
    padding: 8px 8px 8px 8px;
    border: 1px solid transparent;
    border-radius: 14px;
    background: #ebebee;
    color: #2a2a2f;
    box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1), 0 12px 32px rgba(16, 24, 40, 0.12);
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
                transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
    user-select: none;
    -webkit-user-select: none;
    max-width: 420px;
  }
  #preview.visible { display: flex; opacity: 1; transform: translateY(0); }

  #preview img.thumb {
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: 8px;
    background: #d4d4d8;
    flex-shrink: 0;
  }

  #preview input.caption {
    flex: 1 1 auto;
    min-width: 160px;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: inherit;
    padding: 6px 4px;
  }
  #preview input.caption::placeholder {
    color: rgba(42, 42, 47, 0.5);
  }

  #preview button.save {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: #18181b;
    color: #fafafa;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 12px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 160ms ease, transform 100ms ease;
  }
  #preview button.save:hover { background: #27272a; }
  #preview button.save:active { transform: scale(0.97); }
  #preview button.save:disabled { opacity: 0.6; cursor: default; }

  #preview .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }

  /* States piggyback on the save button — replace its content + tone. */
  #preview.state-saving button.save {
    background: #3f3f46;
  }
  #preview.state-success button.save {
    background: #16a34a;
  }
  #preview.state-error button.save {
    background: #dc2626;
  }

  @keyframes vmem-spin { to { transform: rotate(360deg); } }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(250,250,250,0.4);
    border-top-color: #fafafa;
    border-radius: 50%;
    animation: vmem-spin 600ms linear infinite;
  }

  @media (prefers-color-scheme: dark) {
    #preview {
      background: rgba(38, 38, 42, 0.95);
      color: #e4e4e7;
      border-color: rgba(255,255,255,0.08);
      box-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 12px 32px rgba(0,0,0,0.35);
    }
    #preview input.caption::placeholder { color: rgba(228,228,231,0.45); }
    #preview button.save { background: #fafafa; color: #18181b; }
    #preview button.save:hover { background: #ffffff; }
    #preview.state-saving button.save { background: #52525b; color: #fafafa; }
  }
`;
shadow.appendChild(styleEl);

// ── Scrim + rect DOM ──────────────────────────────────────────────────────────

const scrim = document.createElement("div");
scrim.id = "scrim";

const hint = document.createElement("div");
hint.id = "hint";
hint.textContent = "Drag to capture · Esc to cancel";
scrim.appendChild(hint);

const rectEl = document.createElement("div");
rectEl.id = "rect";
scrim.appendChild(rectEl);

shadow.appendChild(scrim);

// ── Preview popup DOM ─────────────────────────────────────────────────────────

const preview = document.createElement("div");
preview.id = "preview";

const thumb = document.createElement("img");
thumb.className = "thumb";
thumb.alt = "Screenshot preview";
preview.appendChild(thumb);

const captionInput = document.createElement("input");
captionInput.className = "caption";
captionInput.type = "text";
captionInput.placeholder = "Add a note (optional)";
captionInput.maxLength = 200;
preview.appendChild(captionInput);

const saveBtn = document.createElement("button");
saveBtn.className = "save";
saveBtn.type = "button";

const saveIcon = document.createElement("span");
saveIcon.className = "icon";
saveIcon.innerHTML = VMEM_ICON;
saveBtn.appendChild(saveIcon);

const saveLabel = document.createElement("span");
saveLabel.textContent = "Save";
saveBtn.appendChild(saveLabel);

preview.appendChild(saveBtn);

shadow.appendChild(preview);

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
      croppedDataUrl = null;
      captionValue = "";
      captionInput.value = "";
      saveIcon.innerHTML = VMEM_ICON;
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
      saveIcon.innerHTML = VMEM_ICON;
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

  // Reject tiny drags — likely a stray click.
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

// ── Capture + crop ────────────────────────────────────────────────────────────

async function captureAndCrop(rect: SelectionRect): Promise<void> {
  // Hide the scrim *before* asking the SW to capture — otherwise the
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
    croppedDataUrl = cropped.dataUrl;
    thumb.src = cropped.dataUrl;
    positionPreview(rect);
    setMode("preview");
  } catch (err) {
    console.error("[vmem] Crop failed:", err);
    setMode("idle");
  }
}

function requestCapture(): Promise<string> {
  return new Promise((resolve, reject) => {
    const message: ContentMessage = { type: "CAPTURE_VISIBLE_TAB" };
    safeSendMessage<BackgroundResponse>(message, (response) => {
      if (!response) {
        reject(new Error("Extension context unavailable"));
        return;
      }
      if (response.type === "CAPTURE_RESULT") {
        resolve(response.dataUrl);
      } else if (response.type === "CAPTURE_ERROR") {
        reject(new Error(response.error));
      } else {
        reject(new Error("Unexpected response from background"));
      }
    });
  });
}

interface CroppedImage {
  blob: Blob;
  dataUrl: string;
}

async function cropImage(
  sourceDataUrl: string,
  rect: SelectionRect,
): Promise<CroppedImage> {
  const img = await loadImage(sourceDataUrl);

  // captureVisibleTab returns an image at devicePixelRatio resolution.
  // Map CSS-pixel rect → image-pixel rect.
  const dpr = window.devicePixelRatio || 1;
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.round(rect.w * dpr);
  const sh = Math.round(rect.h * dpr);

  // Clamp to image bounds in case dpr drift produces an off-by-a-pixel.
  const clampedSx = Math.max(0, Math.min(sx, img.naturalWidth));
  const clampedSy = Math.max(0, Math.min(sy, img.naturalHeight));
  const clampedSw = Math.max(1, Math.min(sw, img.naturalWidth - clampedSx));
  const clampedSh = Math.max(1, Math.min(sh, img.naturalHeight - clampedSy));

  const canvas = document.createElement("canvas");
  canvas.width = clampedSw;
  canvas.height = clampedSh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(
    img,
    clampedSx,
    clampedSy,
    clampedSw,
    clampedSh,
    0,
    0,
    clampedSw,
    clampedSh,
  );

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/png",
    );
  });
  return { blob, dataUrl };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load captured image"));
    img.src = src;
  });
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader returned non-string result"));
        return;
      }
      // Strip the `data:image/png;base64,` prefix.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
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

// Global Esc — cancel from any state.
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

// Mount once the body is available.
function init(): void {
  document.body.appendChild(host);
}

if (document.body) {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}
