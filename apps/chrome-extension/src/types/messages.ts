import type { MemoryCandidate } from "./api";

export type ContentMessage =
  | { type: "RETRIEVE_MEMORIES"; query: string }
  | {
      type: "SAVE_PAGE";
      url: string;
      title: string;
      content: string;
      markdown?: string;
      ogImage?: string;
      ogDescription?: string;
      profileId?: string;
    }
  | {
      type: "SAVE_SELECTION";
      selectedText: string;
      pageUrl: string;
      pageTitle: string;
      profileId?: string;
    }
  | {
      type: "SAVE_YOUTUBE_VIDEO";
      url: string;
      title: string;
      channel: string;
      transcript: string;
      profileId?: string;
    }
  | {
      type: "CAPTURE_PROMPT";
      prompt: string;
      url: string;
      platform: string;
      profileId?: string;
    }
  | { type: "IMPORT_BOOKMARKS" }
  | { type: "IMPORT_HISTORY"; days: number }
  | { type: "CANCEL_IMPORT" };

export type BackgroundResponse =
  | { type: "RETRIEVE_RESULT"; memories: MemoryCandidate[] }
  | { type: "SAVE_RESULT"; success: boolean; memoryId?: string; error?: string }
  | {
      type: "SAVE_DUPLICATE";
      existingMemory: { id: string; title: string; updatedAt: string };
    }
  | {
      type: "IMPORT_RESULT";
      success: boolean;
      count: number;
      skipped?: number;
      locked?: boolean;
      error?: string;
    }
  | { type: "CANCEL_RESULT"; success: boolean };

export type ProgressMessage = {
  type: "IMPORT_PROGRESS";
  current: number;
  total: number;
};
