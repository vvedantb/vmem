// personal keys on the owner's clerk id, team keys on the shared profile alone
// so every member reads and links everyone else's memories
// team ignores userId, membership is checked in convex before the engine call

export type ScopeKind = "personal" | "team";

export type MemoryReadScope =
  | { kind: "personal"; userId: string; profileId?: string | null }
  | { kind: "team"; profileId: string };

export interface DreamScope {
  kind: ScopeKind;
  // personal: userId is the owner's clerk id, team: userId is write attribution only
  userId: string;
  profileId: string;
}

interface ScopeFilterParams {
  userId?: string;
  profileId?: string;
}

export interface ScopeFilter {
  clause: string;
  params: ScopeFilterParams;
}

// personal keeps legacy memories with no profile, team is strict on profileId
// otherwise old personal memories would leak into the shared workspace
export function memoryScopeFilter(
  scope: MemoryReadScope,
  alias: string,
  options?: { skipPersonalProfile?: boolean },
): ScopeFilter {
  if (scope.kind === "team") {
    return {
      clause: `${alias}.profileId = $profileId`,
      params: { profileId: scope.profileId },
    };
  }
  const userClause = `${alias}.userId = $userId`;
  if (
    options?.skipPersonalProfile === true ||
    scope.profileId === null ||
    scope.profileId === undefined
  ) {
    return { clause: userClause, params: { userId: scope.userId } };
  }
  return {
    clause: `${userClause} AND (${alias}.profileId = $profileId OR ${alias}.profileId IS NULL)`,
    params: { userId: scope.userId, profileId: scope.profileId },
  };
}

// chunks have userId but no profileId, so team leaves the chunk unconstrained
export function chunkScopeWhereLine(
  scope: MemoryReadScope,
  alias: string,
): ScopeFilter {
  if (scope.kind === "team") {
    return { clause: "", params: {} };
  }
  return {
    clause: `WHERE ${alias}.userId = $userId`,
    params: { userId: scope.userId },
  };
}
