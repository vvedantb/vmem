// AI-generated (Claude), prompt: "test proposal lookup row schema target vs source memory id"
// Modified by me: defaulted missing proposed title to untitled synthesis
import { describe, expect, it } from "vitest";
import { proposalLookupRowSchema } from "../../engine/neo4j/memory/proposals";

describe("proposalLookupRowSchema", () => {
  it("prefers UPDATE_FOR target over first source memory id", () => {
    const parsed = proposalLookupRowSchema.parse({
      kind: "update",
      proposedTitle: null,
      proposedContent: "next",
      sourceMemoryIds: ["src_1", "src_2"],
      confidence: 0.7,
      targetId: "target_1",
      targetUserId: "user_target",
      sourceUserId: "user_source",
      sourceProfileId: "profile_1",
    });

    expect(parsed.memoryId).toBe("target_1");
    expect(parsed.userId).toBe("user_target");
    expect(parsed.proposedTitle).toBe("Untitled synthesis");
  });

  it("falls back to first source when no UPDATE_FOR target exists", () => {
    const parsed = proposalLookupRowSchema.parse({
      kind: "insight",
      proposedTitle: "Insight",
      proposedContent: "body",
      sourceMemoryIds: ["src_1"],
      confidence: null,
      targetId: null,
      targetUserId: null,
      sourceUserId: "user_source",
      sourceProfileId: null,
    });

    expect(parsed.memoryId).toBe("src_1");
    expect(parsed.userId).toBe("user_source");
  });
});
