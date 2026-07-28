// pure path helpers for the workspace prefixed route tree (`/$profileId/...`)

// first path segments that belonged to the pre-workspace route tree
const LEGACY_FIRST_SEGMENTS = [
  "memories",
  "files",
  "codebases",
  "skills",
  "wiki",
  "activity",
  "inbox",
  "notifications",
  "proposals",
  "teams",
] as const;

export function isLegacyFirstSegment(segment: string): boolean {
  return LEGACY_FIRST_SEGMENTS.some((s) => s === segment);
}

// sections whose immediate child segment is a detail id we drop on switch
const DETAIL_PARENTS = new Set(["skills", "codebases", "wiki"]);

// compute the path for "this same page in another workspace
// first segments of user level (non workspace) routes
const USER_LEVEL_FIRST_SEGMENTS = new Set(["settings", "home", "mcp"]);

export function workspacePathFor(
  pathname: string,
  nextProfileId: string,
  targetHasTeam: boolean,
): string {
  const segments = pathname.split("/").filter(Boolean);
  const root = segments[0];
  // switching workspace from a user level page lands on the new
  // workspace's home rather than mangling /settings/* into a sub path
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
