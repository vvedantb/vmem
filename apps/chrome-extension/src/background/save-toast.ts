import type { ShowToastOptions } from "@/content/shared/toast";

export type SavePageResult = {
  success: boolean;
  memoryId?: string;
  memoryUrl?: string;
  alreadySaved?: boolean;
  error?: string;
};

export const SAVE_FAILED_TOAST: ShowToastOptions = {
  type: "error",
  message: "Failed to save page",
};

// map savePageFromTab result to the page toast
export function toastForSaveResult(result: SavePageResult): ShowToastOptions {
  if (!result.success) return SAVE_FAILED_TOAST;
  return {
    type: "success",
    message: result.alreadySaved ? "Already saved" : "Saved to vmem",
    openUrl: result.memoryUrl,
  };
}
