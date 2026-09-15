import { describe, expect, it } from "vitest";
import {
  isVisibleStatus,
  memoryMatchesScope,
  type MemoryReadScope,
} from "../../engine/memory/scope";

const personal = (
  userId: string,
  profileId?: string | null,
): MemoryReadScope => ({
  kind: "personal",
  userId,
  profileId,
});

const team = (profileId: string): MemoryReadScope => ({
  kind: "team",
  profileId,
});

describe("isVisibleStatus", () => {
  it("treats missing status as active when coalescing", () => {
    expect(isVisibleStatus(undefined)).toBe(true);
    expect(isVisibleStatus(undefined, false)).toBe(false);
  });

  it("keeps active and pinned visible and hides the rest", () => {
    expect(isVisibleStatus("active")).toBe(true);
    expect(isVisibleStatus("pinned")).toBe(true);
    expect(isVisibleStatus("suppressed")).toBe(false);
    expect(isVisibleStatus("expired")).toBe(false);
  });
});

describe("memoryMatchesScope", () => {
  it("scopes personal reads to the owner and optional profile, including legacy null profiles", () => {
    const owned = { userId: "user_a", profileId: "profile_a" };
    const legacy = { userId: "user_a" };
    const other = { userId: "user_b", profileId: "profile_a" };

    expect(memoryMatchesScope(owned, personal("user_a"))).toBe(true);
    expect(memoryMatchesScope(owned, personal("user_a", "profile_a"))).toBe(
      true,
    );
    expect(memoryMatchesScope(legacy, personal("user_a", "profile_a"))).toBe(
      true,
    );
    expect(memoryMatchesScope(owned, personal("user_a", "profile_b"))).toBe(
      false,
    );
    expect(memoryMatchesScope(other, personal("user_a"))).toBe(false);
  });

  it("scopes team reads to profileId alone", () => {
    const memberMemory = { userId: "user_a", profileId: "team_profile" };
    const otherTeam = { userId: "user_a", profileId: "other_profile" };
    const personalLegacy = { userId: "user_a" };

    expect(memoryMatchesScope(memberMemory, team("team_profile"))).toBe(true);
    expect(memoryMatchesScope(otherTeam, team("team_profile"))).toBe(false);
    expect(memoryMatchesScope(personalLegacy, team("team_profile"))).toBe(
      false,
    );
  });
});
