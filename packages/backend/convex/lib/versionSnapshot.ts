import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

// edits within this window by the same author/source coalesce into one version
const BURST_MS = 15 * 60 * 1000;

type VersionSource = "web" | "mcp";

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

export async function mapVersionAuthorSummaries<IdT>(
  ctx: QueryCtx,
  currentUserId: Id<"users">,
  versions: Array<{
    _id: IdT;
    createdAt: number;
    source: VersionSource;
    authorUserId: Id<"users">;
  }>,
): Promise<
  Array<{
    _id: IdT;
    createdAt: number;
    source: VersionSource;
    authorLabel: string;
  }>
> {
  return Promise.all(
    versions.map(async (ver) => ({
      _id: ver._id,
      createdAt: ver.createdAt,
      source: ver.source,
      authorLabel: await resolveVersionAuthorLabel(
        ctx,
        currentUserId,
        ver.authorUserId,
        ver.source,
      ),
    })),
  );
}

interface SnapshotMeta {
  source: VersionSource;
  authorUserId: Id<"users">;
  force?: boolean;
}

interface LatestMarker {
  createdAt: number;
  source: VersionSource;
  authorUserId: Id<"users">;
}

function crossedBoundary(
  latest: LatestMarker | null,
  meta: SnapshotMeta,
  now: number,
): boolean {
  if (meta.force || latest === null) return true;
  if (now - latest.createdAt > BURST_MS) return true;
  return (
    latest.source !== meta.source || latest.authorUserId !== meta.authorUserId
  );
}

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

// snapshot skill pre patch state. call before ctx.db.patch
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

export async function deleteVersionsForSkill(
  ctx: MutationCtx,
  skillId: Id<"skills">,
): Promise<void> {
  for (const version of await ctx.db
    .query("skillVersions")
    .withIndex("by_skill", (q) => q.eq("skillId", skillId))
    .collect()) {
    await ctx.db.delete(version._id);
  }
}
