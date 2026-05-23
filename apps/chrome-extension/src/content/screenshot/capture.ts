/**
 * Pure capture/crop pipeline for the screenshot overlay.
 *
 *   - `requestCapture` asks the background SW for a viewport PNG.
 *   - `cropImage` clips that PNG to the dragged rect on a canvas
 *     (devicePixelRatio aware) and returns both the blob and a data URL.
 *   - `blobToBase64` strips the data URL prefix for transport.
 *
 * No DOM mutation, no module-level state - safe to call from the
 * orchestrator without coupling.
 */

import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { safeSendMessage } from "@/lib/safe-message";
import type { CroppedImage, SelectionRect } from "./types";

export function requestCapture(): Promise<string> {
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

export async function cropImage(
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

export function blobToBase64(blob: Blob): Promise<string> {
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
