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
  | {
      // Sent by the screenshot content script after the user crops a
      // region. The image is base64-encoded PNG (data URL without the
      // `data:image/png;base64,` prefix) — base64 is the only payload form
      // chrome.runtime.sendMessage transports reliably across content/SW.
      type: "SAVE_SCREENSHOT";
      base64Png: string;
      caption?: string;
      pageUrl: string;
      pageTitle: string;
      profileId?: string;
    }
  | {
      // Asks the background SW to capture the visible viewport of the
      // tab the message originates from. Returns a data URL the content
      // script can load into an Image and crop client-side.
      type: "CAPTURE_VISIBLE_TAB";
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
  | { type: "CANCEL_RESULT"; success: boolean }
  | { type: "CAPTURE_RESULT"; dataUrl: string }
  | { type: "CAPTURE_ERROR"; error: string };

export type ProgressMessage = {
  type: "IMPORT_PROGRESS";
  current: number;
  total: number;
};
