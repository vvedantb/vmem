export type {
  DreamScope,
  MemoryReadScope,
  ScopeKind,
} from "../../memory/scope";

import type { MemoryReadScope } from "../../memory/scope";

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
