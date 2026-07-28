// screenshot overlay types for drag handler and capture pipeline

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
