// pure capture/crop pipeline for the screenshot overlay
//
//   requestCapture asks the background sw for a viewport png
//   cropImage clips that png to the dragged rect (dpr aware)
//   blobToBase64 encodes the cropped blob for SAVE_SCREENSHOT

import { base64 as base64Codec } from "@scure/base";
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

// AI-generated (Claude), prompt: "crop visible tab capture to selection rect with device pixel ratio"
// Modified by me: clamp source rect and encode cropped png blob
export async function cropImage(
  sourceDataUrl: string,
  rect: SelectionRect,
): Promise<CroppedImage> {
  const img = await loadImage(sourceDataUrl);

  // captureVisibleTab is at devicePixelRatio map css rect → image pixels
  const dpr = window.devicePixelRatio || 1;
  const sx = Math.max(0, Math.min(Math.round(rect.x * dpr), img.naturalWidth));
  const sy = Math.max(0, Math.min(Math.round(rect.y * dpr), img.naturalHeight));
  const sw = Math.max(
    1,
    Math.min(Math.round(rect.w * dpr), img.naturalWidth - sx),
  );
  const sh = Math.max(
    1,
    Math.min(Math.round(rect.h * dpr), img.naturalHeight - sy),
  );

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

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

export async function blobToBase64(blob: Blob): Promise<string> {
  return base64Codec.encode(new Uint8Array(await blob.arrayBuffer()));
}
