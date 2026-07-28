import { describe, expect, it } from "vitest";
import { retrievalScope } from "../convex/neo4jActions/agent/factDecisionLoop";

// used to hardcode personal scope, so team instructions re added facts teammates already had
const CLERK = "user_2abcCallerClerkId";
const PROFILE = "profile_team_shared";

describe("retrievalScope", () => {
  it("reads the whole team profile for a team write", () => {
    expect(
      retrievalScope({
        clerkId: CLERK,
        profileId: PROFILE,
        graphScope: "team",
        retrieveWithProfileId: true,
      }),
    ).toEqual({ kind: "team", profileId: PROFILE });
  });

  // v2 capture turns profile retrieval off, team still has to win
  it("reads the team profile even when profile retrieval is off", () => {
    expect(
      retrievalScope({
        clerkId: CLERK,
        profileId: PROFILE,
        graphScope: "team",
        retrieveWithProfileId: false,
      }),
    ).toEqual({ kind: "team", profileId: PROFILE });
  });

  it("keeps personal scope profile-filtered when asked", () => {
    expect(
      retrievalScope({
        clerkId: CLERK,
        profileId: PROFILE,
        graphScope: "personal",
        retrieveWithProfileId: true,
      }),
    ).toEqual({ kind: "personal", userId: CLERK, profileId: PROFILE });
  });

  it("falls back to bare personal scope without a profile", () => {
    expect(
      retrievalScope({
        clerkId: CLERK,
        graphScope: "team",
        retrieveWithProfileId: true,
      }),
    ).toEqual({ kind: "personal", userId: CLERK });
    expect(retrievalScope({ clerkId: CLERK, profileId: PROFILE })).toEqual({
      kind: "personal",
      userId: CLERK,
    });
  });
});
