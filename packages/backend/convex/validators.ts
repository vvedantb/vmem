import { v } from "convex/values";

/**
 * Single source of truth for profiles table fields.
 * Used in schema.ts (defineTable) and return validators.
 *
 * A profile is a Chrome-like workspace for organizing memories.
 * Each memory belongs to exactly one profile.
 *
 * Personal profile: teamId undefined, userId = owner.
 * Team profile:    teamId set, userId = team creator (for historical attribution only),
 *                  isDefault always false. Access via teamMembers table.
 */
export const profileFields = {
  userId: v.id("users"),
  name: v.string(),
  color: v.string(), // hex e.g. "#3B82F6"
  icon: v.string(), // icon name e.g. "briefcase"
  isDefault: v.boolean(),
  /** When set, this profile is shared across a team. Access is granted via teamMembers. */
  teamId: v.optional(v.id("teams")),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/**
 * Single source of truth for teams table fields.
 * A team is a group of users sharing a single profile.
 */
export const teamFields = {
  name: v.string(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/**
 * Single source of truth for teamMembers table fields.
 * Membership row joining a user to a team with a role.
 * Uniqueness (one row per (teamId, userId)) enforced in mutations via by_team_user index.
 */
export const teamMemberFields = {
  teamId: v.id("teams"),
  userId: v.id("users"),
  role: v.union(v.literal("owner"), v.literal("member")),
  joinedAt: v.number(),
};

/**
 * Single source of truth for userEnvVars table fields.
 *
 * One document per user. `vars` holds the user's environment variables as
 * `{ key, value }` pairs, where `value` is the ciphertext returned by
 * `lib/crypto.ts#encryptToken` (format `v1:iv:ct`).
 *
 * Storage pattern mirrors conductor's `teamEnvVars` / `repoEnvVars` tables:
 * a single row aggregates all vars for a given scope. Env var sets are
 * bounded in practice; the 1MB document limit is not a concern.
 */
export const userEnvVarFields = {
  userId: v.id("users"),
  vars: v.array(
    v.object({
      key: v.string(),
      /** Ciphertext from encryptToken(). Never exposed to clients except via `revealValue`. */
      value: v.string(),
    }),
  ),
  updatedAt: v.number(),
};

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
