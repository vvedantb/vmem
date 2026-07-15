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
      // sent by the screenshot content script after the user crops a
      // region the image is base64 encoded png (data url without the
      // mime prefix) base64 is the only payload form
      // chrome.runtime.sendMessage transports reliably across content/sw
      type: "SAVE_SCREENSHOT";
      base64Png: string;
      caption?: string;
      pageUrl: string;
      pageTitle: string;
      profileId?: string;
    }
  | {
      // asks the background sw to capture the visible viewport of the
      // tab the message originates from returns a data url the content
      // script can load into an image and crop client side
      type: "CAPTURE_VISIBLE_TAB";
    }
  | { type: "IMPORT_BOOKMARKS" }
  | { type: "IMPORT_HISTORY"; days: number }
  | { type: "CANCEL_IMPORT" }
  | { type: "DEBUG_RUN_AUTO_SYNC" };

export type BackgroundResponse =
  | { type: "RETRIEVE_RESULT"; memories: MemoryCandidate[] }
  | { type: "SAVE_RESULT"; success: boolean; memoryId?: string; error?: string }
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
  | { type: "CAPTURE_ERROR"; error: string }
  | {
      type: "DEBUG_SYNC_RESULT";
      lastHistorySync: number;
      lastBookmarkSync: number;
    };

export type ProgressMessage = {
  type: "IMPORT_PROGRESS";
  current: number;
  total: number;
};
