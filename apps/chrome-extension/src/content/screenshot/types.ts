/**
 * Internal types shared between the screenshot overlay's state machine,
 * drag handler, and capture pipeline. Module-private — not part of the
 * extension's public message API.
 */

export type Mode =
  | "idle"
  | "selecting"
  | "preview"
  | "saving"
  | "success"
  | "error";

/** CSS pixels relative to the viewport. */
export interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CroppedImage {
  blob: Blob;
  dataUrl: string;
}
