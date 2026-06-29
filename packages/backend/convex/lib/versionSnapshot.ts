import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Version snapshots for wiki docs and skills.
 *
 * Model: snapshot the *previous* (pre-patch) state before an overwrite, called
 * from inside the existing update mutations. The live row is always HEAD;
 * versions are strictly older. Because every MCP-agent write force-checkpoints
 * its pre-write state, "undo what the agent changed" is just "restore the
 * newest version".
 *
 * A new version is cut only on a burst boundary so web autosave (which fires
 * every ~800ms) does not flood the history: a different author/source, a gap
 * longer than BURST_MS, or `force` (MCP writes and restores). Consecutive
 * identical snapshots are always skipped — that also stops a brand-new empty
 * doc from minting a junk version.
 */

/** Edits within this window by the same author/source coalesce into one version. */
const BURST_MS = 15 * 60 * 1000;

type VersionSource = "web" | "mcp";

/**
 * The label the history UI shows for who made a version: "Agent" for MCP
 * writes, "You" for the current user, otherwise the team member's name.
 */
export async function resolveVersionAuthorLabel(
  ctx: QueryCtx,
  currentUserId: Id<"users">,
  authorUserId: Id<"users">,
  source: VersionSource,
): Promise<string> {
  if (source === "mcp") return "Agent";
  if (authorUserId === currentUserId) return "You";
  const author = await ctx.db.get(authorUserId);
  return author?.fullName ?? author?.firstName ?? "Member";
}

interface SnapshotMeta {
  source: VersionSource;
  authorUserId: Id<"users">;
  /**
   * Snapshot regardless of the burst/author/source boundary (MCP writes,
   * restores). Duplicate content is still skipped.
   */
  force?: boolean;
}

interface LatestMarker {
  createdAt: number;
  source: VersionSource;
  authorUserId: Id<"users">;
}

/** True when this write clearly begins a new editing burst. */
function crossedBoundary(
  latest: LatestMarker | null,
  meta: SnapshotMeta,
  now: number,
): boolean {
  if (meta.force) return true;
  if (latest === null) return true;
  if (now - latest.createdAt > BURST_MS) return true;
  if (latest.source !== meta.source) return true;
  if (latest.authorUserId !== meta.authorUserId) return true;
  return false;
}

/**
 * Snapshot a wiki document's current state before it is overwritten.
 * No-op for folders (no content) and when nothing changed since the last
 * version. Call BEFORE `ctx.db.patch(node._id, ...)`.
 */
export async function maybeSnapshotWikiVersion(
  ctx: MutationCtx,
  node: Doc<"wikiNodes">,
  meta: SnapshotMeta,
): Promise<void> {
  if (node.kind !== "document") return;

  const latest = await ctx.db
    .query("wikiNodeVersions")
    .withIndex("by_node", (q) => q.eq("nodeId", node._id))
    .order("desc")
    .first();

  const title = node.title;
  const content = node.content ?? "";
  const contentText = node.contentText ?? "";

  // Never store consecutive identical snapshots.
  if (latest !== null && latest.title === title && latest.content === content) {
    return;
  }
  // Nothing worth keeping for a brand-new, never-saved document.
  if (latest === null && content.length === 0) return;

  const now = Date.now();
  if (!crossedBoundary(latest, meta, now)) return;

  await ctx.db.insert("wikiNodeVersions", {
    nodeId: node._id,
    title,
    content,
    contentText,
    authorUserId: meta.authorUserId,
    source: meta.source,
    createdAt: now,
  });
}

/** True when two skill snapshots carry identical user-visible content. */
function skillUnchanged(
  latest: Doc<"skillVersions">,
  skill: Doc<"skills">,
): boolean {
  return (
    latest.name === skill.name &&
    latest.description === skill.description &&
    latest.instructions === skill.instructions &&
    (latest.enabled ?? true) === (skill.enabled ?? true)
  );
}

/**
 * Snapshot a skill's current state before it is overwritten. No-op when
 * nothing changed since the last version. Call BEFORE `ctx.db.patch`.
 */
export async function maybeSnapshotSkillVersion(
  ctx: MutationCtx,
  skill: Doc<"skills">,
  meta: SnapshotMeta,
): Promise<void> {
  const latest = await ctx.db
    .query("skillVersions")
    .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
    .order("desc")
    .first();

  if (latest !== null && skillUnchanged(latest, skill)) return;

  const now = Date.now();
  if (!crossedBoundary(latest, meta, now)) return;

  await ctx.db.insert("skillVersions", {
    skillId: skill._id,
    name: skill.name,
    description: skill.description,
    instructions: skill.instructions,
    enabled: skill.enabled,
    authorUserId: meta.authorUserId,
    source: meta.source,
    createdAt: now,
  });
}

/** Remove every version snapshot of a wiki node (call when deleting the node). */
export async function deleteVersionsForWikiNode(
  ctx: MutationCtx,
  nodeId: Id<"wikiNodes">,
): Promise<void> {
  const versions = await ctx.db
    .query("wikiNodeVersions")
    .withIndex("by_node", (q) => q.eq("nodeId", nodeId))
    .collect();
  for (const version of versions) {
    await ctx.db.delete(version._id);
  }
}

/** Remove every version snapshot of a skill (call when deleting the skill). */
export async function deleteVersionsForSkill(
  ctx: MutationCtx,
  skillId: Id<"skills">,
): Promise<void> {
  const versions = await ctx.db
    .query("skillVersions")
    .withIndex("by_skill", (q) => q.eq("skillId", skillId))
    .collect();
  for (const version of versions) {
    await ctx.db.delete(version._id);
  }
}
