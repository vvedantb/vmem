export type SavePageResult = {
  success: boolean;
  memoryId?: string;
  error?: string;
};

export type SaveToast = {
  message: string;
  color: string;
};

// map savePageFromTab result to toast copy and color
export function toastForSaveResult(result: SavePageResult): SaveToast {
  if (result.success) {
    return { message: "✓ Page saved to vmem", color: "#4ade80" };
  }
  return { message: "✗ Failed to save page", color: "#f87171" };
}
