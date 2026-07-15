import { z } from "zod";
import type { MemoryCandidate } from "./api";

const retrieveMemoriesMessageSchema = z.object({
  type: z.literal("RETRIEVE_MEMORIES"),
  query: z.string(),
});

const savePageMessageSchema = z.object({
  type: z.literal("SAVE_PAGE"),
  url: z.string(),
  title: z.string(),
  content: z.string(),
  markdown: z.string().optional(),
  ogImage: z.string().optional(),
  ogDescription: z.string().optional(),
  profileId: z.string().optional(),
});

const saveSelectionMessageSchema = z.object({
  type: z.literal("SAVE_SELECTION"),
  selectedText: z.string(),
  pageUrl: z.string(),
  pageTitle: z.string(),
  profileId: z.string().optional(),
});

const saveYoutubeVideoMessageSchema = z.object({
  type: z.literal("SAVE_YOUTUBE_VIDEO"),
  url: z.string(),
  title: z.string(),
  channel: z.string(),
  transcript: z.string(),
  profileId: z.string().optional(),
});

const capturePromptMessageSchema = z.object({
  type: z.literal("CAPTURE_PROMPT"),
  prompt: z.string(),
  url: z.string(),
  platform: z.string(),
  profileId: z.string().optional(),
});

// sent by the screenshot content script after the user crops a region the
// image is base64 encoded png (data url without the mime prefix) base64 is
// the only payload form chrome.runtime.sendMessage transports reliably
const saveScreenshotMessageSchema = z.object({
  type: z.literal("SAVE_SCREENSHOT"),
  base64Png: z.string(),
  caption: z.string().optional(),
  pageUrl: z.string(),
  pageTitle: z.string(),
  profileId: z.string().optional(),
});

// asks the background sw to capture the visible viewport of the tab the
// message originates from returns a data url the content script can load
// into an image and crop client side
const captureVisibleTabMessageSchema = z.object({
  type: z.literal("CAPTURE_VISIBLE_TAB"),
});

const importBookmarksMessageSchema = z.object({
  type: z.literal("IMPORT_BOOKMARKS"),
});

const importHistoryMessageSchema = z.object({
  type: z.literal("IMPORT_HISTORY"),
  days: z.number(),
});

const cancelImportMessageSchema = z.object({
  type: z.literal("CANCEL_IMPORT"),
});

const debugRunAutoSyncMessageSchema = z.object({
  type: z.literal("DEBUG_RUN_AUTO_SYNC"),
});

export const contentMessageSchema = z.discriminatedUnion("type", [
  retrieveMemoriesMessageSchema,
  savePageMessageSchema,
  saveSelectionMessageSchema,
  saveYoutubeVideoMessageSchema,
  capturePromptMessageSchema,
  saveScreenshotMessageSchema,
  captureVisibleTabMessageSchema,
  importBookmarksMessageSchema,
  importHistoryMessageSchema,
  cancelImportMessageSchema,
  debugRunAutoSyncMessageSchema,
]);

export type ContentMessage = z.infer<typeof contentMessageSchema>;

const retrieveResultSchema = z.object({
  type: z.literal("RETRIEVE_RESULT"),
  memories: z.custom<MemoryCandidate[]>((value): value is MemoryCandidate[] =>
    Array.isArray(value),
  ),
});

const saveResultSchema = z.object({
  type: z.literal("SAVE_RESULT"),
  success: z.boolean(),
  memoryId: z.string().optional(),
  error: z.string().optional(),
});

const importResultSchema = z.object({
  type: z.literal("IMPORT_RESULT"),
  success: z.boolean(),
  count: z.number(),
  skipped: z.number().optional(),
  locked: z.boolean().optional(),
  error: z.string().optional(),
});

const cancelResultSchema = z.object({
  type: z.literal("CANCEL_RESULT"),
  success: z.boolean(),
});

const captureResultSchema = z.object({
  type: z.literal("CAPTURE_RESULT"),
  dataUrl: z.string(),
});

const captureErrorSchema = z.object({
  type: z.literal("CAPTURE_ERROR"),
  error: z.string(),
});

const debugSyncResultSchema = z.object({
  type: z.literal("DEBUG_SYNC_RESULT"),
  lastHistorySync: z.number(),
  lastBookmarkSync: z.number(),
});

export const backgroundResponseSchema = z.discriminatedUnion("type", [
  retrieveResultSchema,
  saveResultSchema,
  importResultSchema,
  cancelResultSchema,
  captureResultSchema,
  captureErrorSchema,
  debugSyncResultSchema,
]);

export type BackgroundResponse = z.infer<typeof backgroundResponseSchema>;

export const progressMessageSchema = z.object({
  type: z.literal("IMPORT_PROGRESS"),
  current: z.number(),
  total: z.number(),
});

export type ProgressMessage = z.infer<typeof progressMessageSchema>;
