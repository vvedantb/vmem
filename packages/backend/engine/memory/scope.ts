// personal keys on the owner's clerk id, team keys on the shared profile alone
// so every member reads and links everyone else's memories
// team ignores userId, membership is checked in convex before the store call

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

const VISIBLE_MEMORY_STATUSES = ["active", "pinned"] as const;

interface MemoryScopeFields {
  userId: string;
  profileId?: string | null;
}

export function isVisibleStatus(
  status: string | undefined,
  coalesce = true,
): boolean {
  const effective = coalesce ? (status ?? "active") : status;
  if (effective === undefined) return false;
  return (VISIBLE_MEMORY_STATUSES as readonly string[]).includes(effective);
}

function isMissingProfileId(profileId: string | null | undefined): boolean {
  return profileId === null || profileId === undefined;
}

// personal keeps legacy memories with no profile, team is strict on profileId
// otherwise old personal memories would leak into the shared workspace
export function memoryMatchesScope(
  memory: MemoryScopeFields,
  scope: MemoryReadScope,
  options?: { skipPersonalProfile?: boolean },
): boolean {
  if (scope.kind === "team") {
    return memory.profileId === scope.profileId;
  }
  if (memory.userId !== scope.userId) return false;
  if (
    options?.skipPersonalProfile === true ||
    isMissingProfileId(scope.profileId)
  ) {
    return true;
  }
  return (
    memory.profileId === scope.profileId || isMissingProfileId(memory.profileId)
  );
}
