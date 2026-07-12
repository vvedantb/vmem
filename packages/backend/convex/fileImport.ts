"use node";

import { v } from "convex/values";
import crypto from "node:crypto";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import { extractFileContent } from "../engine/parsers/extractFileContent";
import { detectFileKind } from "./files/lib";
import type { Id } from "./_generated/dataModel";

/**
 * Maximum size of an uploaded file. 25 MB is far above what the typical
 * note/article PDF needs but well below Convex's 1 GB storage cap; over
 * that range PDF text extraction starts taking long enough to bump up
 * against action timeouts.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Pick a sensible memory title from the extracted text. Uses the first
 * non-empty line (PDFs typically have a heading on the first page; .md
 * files start with the H1). Falls back to the filename when the file is
 * empty or starts with whitespace.
 */
function chooseTitle(extractedText: string, filename: string): string {
  const firstLine = extractedText
    .split("\n")
    .find((line) => line.trim().length > 0);
  if (!firstLine) return filename;
  const trimmed = firstLine.trim().replace(/^#+\s*/, "");
  // Cap at 200 chars so we don't end up with a wall-of-text title.
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}

interface MemoryWithTags {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string;
  source: string;
  confidence: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  tags: string[];
}

/**
 * Process an uploaded file (already in Convex storage):
 *   1. Read the blob from storage.
 *   2. Detect kind by extension/MIME (only PDF/TXT/MD supported).
 *   3. Extract text via the appropriate parser.
 *   4. Hash the extracted text → use as externalId with `sourceType:
 *      "file-upload"` so the same file uploaded twice de-duplicates
 *      (Layer 0 in `createMemoryInternal`).
 *   5. Forward to `createMemoryInternal` which handles dedup, embedding,
 *      enrichment, and chunk-pipeline scheduling for long content.
 *
 * Returns the created (or de-duplicated) memory. Caller can navigate
 * directly to `/memories/${id}` after the call resolves.
 */
export const importMemoryFromFile = authAction({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemoryWithTags> => {
    const clerkId = await requireClerkId(ctx);

    if (args.profileId) {
      await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
        profileId: args.profileId,
        userId: ctx.userId,
      });
    }

    const kind = detectFileKind(args.filename, args.mimeType);
    if (kind === null) {
      throw new Error(
        `Unsupported file type: ${args.filename}. Only PDF and text-like files (.txt, .md, json, xml) are supported.`,
      );
    }

    // Pull the blob from storage. Returns null if storageId is invalid or
    // the file was deleted before we got to it.
    const storageId: Id<"_storage"> = args.storageId;
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new Error("Uploaded file not found in storage");

    if (blob.size > MAX_UPLOAD_BYTES) {
      // Clean up the over-large file so we don't leak storage.
      await ctx.storage.delete(storageId);
      throw new Error(
        `File too large: ${(blob.size / (1024 * 1024)).toFixed(1)} MB. Maximum is 25 MB.`,
      );
    }

    const content = await extractFileContent(blob, kind);

    if (content.trim().length === 0) {
      throw new Error(
        "Could not extract any text from the file. Is it a scanned image PDF?",
      );
    }

    // Content hash → stable externalId. Re-uploading the same file (even
    // under a different filename) hits Layer 0 dedup and returns the
    // existing memory instead of duplicating.
    const externalId = crypto
      .createHash("sha256")
      .update(content)
      .digest("hex");

    const title = chooseTitle(content, args.filename);

    const memory: MemoryWithTags = await ctx.runAction(
      internal.neo4jActions.memories.createMemoryInternal,
      {
        clerkId,
        profileId: args.profileId,
        title,
        content,
        type: "knowledge",
        source: "file-upload",
        tags: [kind === "pdf" ? "pdf" : "text", "upload"],
        confidence: 1.0,
        externalId,
        sourceType: "file-upload",
        storageId: args.storageId,
        mimeType: args.mimeType,
        originalFilename: args.filename,
      },
    );

    return memory;
  },
});

/**
 * Process an uploaded screenshot/image (already in Convex storage):
 *   1. Verify the storage object exists and isn't oversized.
 *   2. Skip text extraction — screenshots are stored as the image blob,
 *      with the optional caption used as the memory's text content.
 *   3. Forward to `createMemoryInternal` with `storageId`/`mimeType` so
 *      the Memory node points at the stored image. Source-type
 *      `screenshot` (not the file-upload Layer 0 dedup tuple) so multiple
 *      screenshots on the same page don't collapse into one.
 *
 * Used by the Chrome extension's region screenshot tool.
 */
export const importImageMemory = authAction({
  args: {
    storageId: v.id("_storage"),
    mimeType: v.string(),
    caption: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    pageTitle: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemoryWithTags> => {
    const clerkId = await requireClerkId(ctx);

    if (args.profileId) {
      await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
        profileId: args.profileId,
        userId: ctx.userId,
      });
    }

    if (!args.mimeType.startsWith("image/")) {
      throw new Error(
        `Unsupported screenshot mime type: ${args.mimeType}. Expected image/*.`,
      );
    }

    const storageId: Id<"_storage"> = args.storageId;
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new Error("Uploaded screenshot not found in storage");

    if (blob.size > MAX_UPLOAD_BYTES) {
      await ctx.storage.delete(storageId);
      throw new Error(
        `Screenshot too large: ${(blob.size / (1024 * 1024)).toFixed(1)} MB. Maximum is 25 MB.`,
      );
    }

    const caption = args.caption?.trim() ?? "";
    const hostname = args.pageUrl
      ? (safeHostname(args.pageUrl) ?? "screenshot")
      : "screenshot";

    // Title preference: caption (truncated) → page title → "Screenshot from <host>".
    let title: string;
    if (caption.length > 0) {
      title = caption.length > 80 ? caption.slice(0, 80) + "…" : caption;
    } else if (args.pageTitle && args.pageTitle.trim().length > 0) {
      const t = args.pageTitle.trim();
      title = `Screenshot · ${t.length > 70 ? t.slice(0, 70) + "…" : t}`;
    } else {
      title = `Screenshot from ${hostname}`;
    }

    // Use the storageId as the externalId so re-saving the exact same blob
    // (same upload flow) is idempotent — but each new screenshot has a
    // fresh storageId, so visually-similar screenshots from the same page
    // don't dedupe (unlike pages, which dedupe on URL).
    const externalId = crypto
      .createHash("sha256")
      .update(storageId)
      .digest("hex");

    // Screenshots intentionally don't pass `url` to createMemoryInternal:
    // Layer-1 URL dedup would collapse a screenshot into a prior
    // page-save memory at the same URL. The page URL is preserved in the
    // memory body for context.
    const contentParts: string[] = [];
    if (caption.length > 0) contentParts.push(caption);
    if (args.pageUrl) contentParts.push(`Source: ${args.pageUrl}`);
    const content = contentParts.join("\n\n");

    const memory: MemoryWithTags = await ctx.runAction(
      internal.neo4jActions.memories.createMemoryInternal,
      {
        clerkId,
        profileId: args.profileId,
        title,
        content,
        type: "knowledge",
        source: "browser-extension",
        tags: [hostname, "screenshot"],
        confidence: 1.0,
        externalId,
        sourceType: "screenshot",
        storageId,
        mimeType: args.mimeType,
        originalFilename: `screenshot-${Date.now()}.png`,
      },
    );

    return memory;
  },
});

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
