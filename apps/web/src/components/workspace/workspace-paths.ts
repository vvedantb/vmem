/**
 * Pure path helpers for the workspace-prefixed route tree (`/$profileId/...`).
 *
 * Every app route except `/settings/**` lives under a dynamic profile-id
 * segment. These helpers translate between the old bare paths and the new
 * prefixed ones, and compute "same page, different workspace" targets for
 * the workspace switcher.
 */

/**
 * First path segments that belonged to the pre-workspace route tree.
 * A URL whose first segment matches one of these is a legacy deep link
 * (old bookmark / stale doc) and gets re-prefixed with the resolved
 * default workspace id instead of 404ing.
 *
 * `teams` is handled specially by LegacyPathRedirect (the old
 * `/teams/$teamId/*` pages map onto the team's workspace).
 */
export const LEGACY_FIRST_SEGMENTS = [
  "chat",
  "voice",
  "memories",
  "files",
  "codebases",
  "skills",
  "wiki",
  "activity",
  "inbox",
  "notifications",
  "proposals",
  "ai-logs",
  "openrouter-logs",
  "teams",
] as const;

export function isLegacyFirstSegment(segment: string): boolean {
  return LEGACY_FIRST_SEGMENTS.some((s) => s === segment);
}

/** Sections whose immediate child segment is a detail id we drop on switch. */
const DETAIL_PARENTS = new Set(["skills", "codebases", "wiki"]);

/**
 * Compute the path for "this same page in another workspace".
 *
 * - Strips the current first segment (profile id or legacy segment).
 * - Drops trailing detail ids (`/skills/$id` → `/skills`,
 *   `/memories/list/$id` → `/memories/list`) — a detail record belongs to
 *   one workspace and won't exist in the target.
 * - `/team/*` pages only exist on team workspaces; switching to a
 *   workspace without a team lands on `/home`.
 */
/** First segments of user-level (non-workspace) routes. */
const USER_LEVEL_FIRST_SEGMENTS = new Set([
  "settings",
  "home",
  "svg-playground",
  "mcp",
  "agent-callback",
]);

export function workspacePathFor(
  pathname: string,
  nextProfileId: string,
  targetHasTeam: boolean,
): string {
  const segments = pathname.split("/").filter(Boolean);
  const root = segments[0];
  // Switching workspace from a user-level page lands on the new
  // workspace's home rather than mangling /settings/* into a sub-path.
  if (root === undefined || USER_LEVEL_FIRST_SEGMENTS.has(root)) {
    return `/${nextProfileId}/home`;
  }
  const sub = segments.slice(1);
  const first = sub[0];
  if (first === undefined) return `/${nextProfileId}/home`;
  if (first === "team" && !targetHasTeam) return `/${nextProfileId}/home`;

  let kept = sub;
  if (sub.length === 2 && DETAIL_PARENTS.has(first)) {
    kept = [first];
  } else if (sub.length === 3 && first === "memories" && sub[1] === "list") {
    kept = ["memories", "list"];
  }
  return `/${nextProfileId}/${kept.join("/")}`;
}
