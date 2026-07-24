export type SavePageResult = {
  success: boolean;
  memoryId?: string;
  error?: string;
};

export type SaveToast = {
  message: string;
  color: string;
};

// pick toast copy/colour from savepagefromtab's result (does not throw on failure)
export function toastForSaveResult(result: SavePageResult): SaveToast {
  if (result.success) {
    return { message: "✓ Page saved to vmem", color: "#4ade80" };
  }
  return { message: "✗ Failed to save page", color: "#f87171" };
}
