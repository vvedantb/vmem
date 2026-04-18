import { v } from "convex/values";

/**
 * Single source of truth for wikiNodes table fields.
 * Used in schema.ts (defineTable) and anywhere we need to describe a wikiNode row.
 *
 * A wiki node is either a folder or a document (obsidian-style). Folders are just
 * nodes with children; documents carry the editor content. One table keeps traversal
 * and CRUD trivial.
 */
export const wikiNodeFields = {
  userId: v.id("users"),
  /** undefined = root-level node */
  parentId: v.optional(v.id("wikiNodes")),
  kind: v.union(v.literal("folder"), v.literal("document")),
  title: v.string(),
  /** TipTap ProseMirror JSON, serialized. Undefined for folders and unsaved docs. */
  contentJson: v.optional(v.string()),
  /** Plain-text mirror of contentJson used for the Convex full-text searchIndex. */
  contentText: v.optional(v.string()),
  /** Manual ordering within a parent; higher = later. */
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
};
