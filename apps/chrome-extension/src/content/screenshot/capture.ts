// viewport capture, dpr-aware crop, base64 encode for saveScreenshot

import { base64 as base64Codec } from "@scure/base";
import { sendMessage } from "@/lib/messaging";
import type { CroppedImage, SelectionRect } from "./types";

export async function requestCapture(): Promise<string> {
  const result = await sendMessage("captureVisibleTab");
  return result.dataUrl;
}

export async function cropImage(
  sourceDataUrl: string,
  rect: SelectionRect,
): Promise<CroppedImage> {
  const img = await loadImage(sourceDataUrl);

  // map css selection rect to device pixel capture coordinates
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
