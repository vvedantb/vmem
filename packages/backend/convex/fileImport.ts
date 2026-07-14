"use node";

import { v } from "convex/values";
import crypto from "node:crypto";
import { authAction, requireClerkId, type AuthActionCtx } from "./auth";
import { internal } from "./_generated/api";
import { extractFileContent } from "../engine/parsers/extractFileContent";
import { detectFileKind } from "./files/lib";
import type { Id } from "./_generated/dataModel";
import type { MemoryWithTags } from "./memoryApi/types";

// maximum size of an uploaded file
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// pick a sensible memory title from the extracted text
function chooseTitle(extractedText: string, filename: string): string {
  const firstLine = extractedText
    .split("\n")
    .find((line) => line.trim().length > 0);
  if (!firstLine) return filename;
  const trimmed = firstLine.trim().replace(/^#+\s*/, "");
  // cap at 200 chars so we don't end up with a wall-of-text title
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}

function truncateTitle(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function chooseScreenshotTitle(
  caption: string,
  pageTitle: string | undefined,
  hostname: string,
): string {
  if (caption.length > 0) return truncateTitle(caption, 80);
  const trimmedPageTitle = pageTitle?.trim();
  if (trimmedPageTitle && trimmedPageTitle.length > 0) {
    return `Screenshot · ${truncateTitle(trimmedPageTitle, 70)}`;
  }
  return `Screenshot from ${hostname}`;
}

async function assertProfileAccessIfPresent(
  ctx: AuthActionCtx,
  profileId: string | undefined,
): Promise<void> {
  if (!profileId) return;
  await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
    profileId,
    userId: ctx.userId,
  });
}

// load an uploaded blob from storage, enforcing `MAX_UPLOAD_BYTES`
async function loadUploadedBlob(
  ctx: {
    storage: {
      get: (id: Id<"_storage">) => Promise<Blob | null>;
      delete: (id: Id<"_storage">) => Promise<void>;
    };
  },
  storageId: Id<"_storage">,
  label: string,
): Promise<Blob> {
  const blob = await ctx.storage.get(storageId);
  if (!blob) throw new Error(`Uploaded ${label} not found in storage`);

  if (blob.size > MAX_UPLOAD_BYTES) {
    await ctx.storage.delete(storageId);
    throw new Error(
      `${label.charAt(0).toUpperCase()}${label.slice(1)} too large: ${(blob.size / (1024 * 1024)).toFixed(1)} MB. Maximum is 25 MB.`,
    );
  }

  return blob;
}

// process an uploaded file (already in Convex storage): 1
export const importMemoryFromFile = authAction({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemoryWithTags> => {
    const clerkId = await requireClerkId(ctx);
    await assertProfileAccessIfPresent(ctx, args.profileId);

    const kind = detectFileKind(args.filename, args.mimeType);
    if (kind === null) {
      throw new Error(
        `Unsupported file type: ${args.filename}. Only PDF and text-like files (.txt, .md, json, xml) are supported.`,
      );
    }

    // pull the blob from storage. Returns null if storageId is invalid or
    // the file was deleted before we got to it
    const blob = await loadUploadedBlob(ctx, args.storageId, "file");

    const content = await extractFileContent(blob, kind);

    if (content.trim().length === 0) {
      throw new Error(
        "Could not extract any text from the file. Is it a scanned image PDF?",
      );
    }

    // content hash → stable externalId
    const externalId = crypto
      .createHash("sha256")
      .update(content)
      .digest("hex");

    const title = chooseTitle(content, args.filename);

    return await ctx.runAction(
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
  },
});

// process an uploaded screenshot/image (already in Convex storage): 1
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
    await assertProfileAccessIfPresent(ctx, args.profileId);

    if (!args.mimeType.startsWith("image/")) {
      throw new Error(
        `Unsupported screenshot mime type: ${args.mimeType}. Expected image/*.`,
      );
    }

    await loadUploadedBlob(ctx, args.storageId, "screenshot");

    const caption = args.caption?.trim() ?? "";
    const hostname = args.pageUrl
      ? (safeHostname(args.pageUrl) ?? "screenshot")
      : "screenshot";
    const title = chooseScreenshotTitle(caption, args.pageTitle, hostname);

    // use the storageId as the externalId so re-saving the exact same blob (same
    const externalId = crypto
      .createHash("sha256")
      .update(args.storageId)
      .digest("hex");

    // screenshots intentionally don't pass `url` to createMemoryInternal
    const contentParts: string[] = [];
    if (caption.length > 0) contentParts.push(caption);
    if (args.pageUrl) contentParts.push(`Source: ${args.pageUrl}`);

    return await ctx.runAction(
      internal.neo4jActions.memories.createMemoryInternal,
      {
        clerkId,
        profileId: args.profileId,
        title,
        content: contentParts.join("\n\n"),
        type: "knowledge",
        source: "browser-extension",
        tags: [hostname, "screenshot"],
        confidence: 1.0,
        externalId,
        sourceType: "screenshot",
        storageId: args.storageId,
        mimeType: args.mimeType,
        originalFilename: `screenshot-${Date.now()}.png`,
      },
    );
  },
});

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
