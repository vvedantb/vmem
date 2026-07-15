// internal types shared by the screenshot overlay state machine
// drag handler and capture pipeline not part of the public message api

export type Mode =
  | "idle"
  | "selecting"
  | "preview"
  | "saving"
  | "success"
  | "error";

// css pixels relative to the viewport
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
