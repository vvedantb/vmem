import { describe, expect, it } from "vitest";
import {
  canResolveProposal,
  type ProposalScopeCheck,
} from "../engine/neo4j/memory/proposals";
import type { MemoryReadScope } from "../engine/neo4j/memory/scope";

const OWNER = "user_owner";
const STRANGER = "user_stranger";
const TEAM_PROFILE = "profile_team";
const OTHER_PROFILE = "profile_other";

const EMPTY: ProposalScopeCheck = {
  teamProfileId: null,
  targetUserId: null,
  targetProfileId: null,
  sourceUserId: null,
  sourceProfileId: null,
};

const personal = (userId: string): MemoryReadScope => ({
  kind: "personal",
  userId,
});
const team = (profileId: string): MemoryReadScope => ({
  kind: "team",
  profileId,
});

describe("canResolveProposal", () => {
  it("lets the target memory's owner resolve their own proposal", () => {
    const check = { ...EMPTY, targetUserId: OWNER };
    expect(canResolveProposal(check, personal(OWNER))).toBe(true);
  });

  it("blocks a stranger holding the proposal uuid", () => {
    const check = { ...EMPTY, targetUserId: OWNER };
    expect(canResolveProposal(check, personal(STRANGER))).toBe(false);
  });

  it("falls back to the first source when the proposal has no target", () => {
    // synthesis proposals link DERIVED_FROM, so there is no UPDATE_FOR target
    const check = { ...EMPTY, sourceUserId: OWNER };
    expect(canResolveProposal(check, personal(OWNER))).toBe(true);
    expect(canResolveProposal(check, personal(STRANGER))).toBe(false);
  });

  it("lets any member of the team profile resolve a team synthesis proposal", () => {
    const check = {
      ...EMPTY,
      teamProfileId: TEAM_PROFILE,
      sourceUserId: OWNER,
      sourceProfileId: TEAM_PROFILE,
    };
    expect(canResolveProposal(check, team(TEAM_PROFILE))).toBe(true);
    expect(canResolveProposal(check, team(OTHER_PROFILE))).toBe(false);
  });

  it("blocks a personal caller from resolving a team synthesis proposal", () => {
    // it materialises to the team owner, so it must not run through a personal call
    const check = {
      ...EMPTY,
      teamProfileId: TEAM_PROFILE,
      sourceUserId: OWNER,
      sourceProfileId: TEAM_PROFILE,
    };
    expect(canResolveProposal(check, personal(OWNER))).toBe(false);
  });

  it("authorises an extraction proposal on a team memory by the target's profile", () => {
    // v2 extraction writes no teamProfileId, so only the target memory says team
    const check = {
      ...EMPTY,
      targetUserId: OWNER,
      targetProfileId: TEAM_PROFILE,
    };
    expect(canResolveProposal(check, team(TEAM_PROFILE))).toBe(true);
    expect(canResolveProposal(check, team(OTHER_PROFILE))).toBe(false);
  });

  it("denies when the proposal carries no ownership at all", () => {
    expect(canResolveProposal(EMPTY, personal(OWNER))).toBe(false);
    expect(canResolveProposal(EMPTY, team(TEAM_PROFILE))).toBe(false);
  });
});
