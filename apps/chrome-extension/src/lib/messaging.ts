import { defineExtensionMessaging } from "@webext-core/messaging";
import type { MemoryCandidate } from "@/types/api";

export type SaveOutcome = {
  memoryId?: string;
};

type ImportOutcome = {
  count: number;
  skipped?: number;
  locked?: boolean;
};

export type ExtractPageData = {
  title: string;
  ogTitle?: string;
  content: string;
  html: string;
  ogImage?: string;
  ogDescription?: string;
  favicon?: string;
  // readability: true when parsed, false on fallback extraction
  usedReadability: boolean;
};

type DebugSyncResult = {
  lastHistorySync: number;
  lastBookmarkSync: number;
};

type ImportProgressData = {
  current: number;
  total: number;
};

interface ProtocolMap {
  retrieveMemories(data: { query: string }): MemoryCandidate[];
  savePage(data: {
    url: string;
    title: string;
    content: string;
    markdown?: string;
    ogImage?: string;
    ogDescription?: string;
    profileId?: string;
  }): SaveOutcome;
  saveSelection(data: {
    selectedText: string;
    pageUrl: string;
    pageTitle: string;
    profileId?: string;
  }): SaveOutcome;
  saveYoutubeVideo(data: {
    url: string;
    title: string;
    channel: string;
    transcript: string;
    profileId?: string;
  }): SaveOutcome;
  capturePrompt(data: {
    prompt: string;
    url: string;
    platform: string;
    profileId?: string;
  }): SaveOutcome;
  saveScreenshot(data: {
    base64Png: string;
    caption?: string;
    pageUrl: string;
    pageTitle: string;
    profileId?: string;
  }): SaveOutcome;
  captureVisibleTab(): { dataUrl: string };
  importBookmarks(): ImportOutcome;
  importHistory(data: { days: number }): ImportOutcome;
  cancelImport(): void;
  debugRunAutoSync(): DebugSyncResult;
  importProgress(data: ImportProgressData): void;
  extractPage(): ExtractPageData;
  startScreenshot(): { ok: true };
}

const messenger = defineExtensionMessaging<ProtocolMap>();
export const sendMessage = messenger.sendMessage.bind(messenger);
export const onMessage = messenger.onMessage.bind(messenger);
