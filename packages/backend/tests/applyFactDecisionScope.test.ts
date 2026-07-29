import { beforeEach, describe, expect, it, vi } from "vitest";
import neo4j from "neo4j-driver";
import { applyFactUpdateOrDelete } from "../convex/neo4jActions/agent/applyFactDecision";
import { getMemory } from "../engine/neo4j/memory/crud";
import type { MemoryReadScope } from "../engine/neo4j/memory/scope";
import { getMemoryForTeam } from "../engine/neo4j/memory/team";
import type { MemoryWithTags } from "../engine/neo4j/memory/types";

vi.mock("../engine/neo4j/memory/crud", () => ({ getMemory: vi.fn() }));
vi.mock("../engine/neo4j/memory/team", () => ({ getMemoryForTeam: vi.fn() }));
vi.mock("../engine/neo4j/memory/proposals", () => ({
  createProposedUpdate: vi.fn(() => Promise.resolve({ id: "proposal_1" })),
  createProposedDelete: vi.fn(() => Promise.resolve({ id: "proposal_1" })),
}));

// apply must use the same scope as retrieval, or teammate targets get dropped
const CLERK = "user_2abcCallerClerkId";
const PROFILE = "profile_team_shared";
const TARGET = "memory_owned_by_a_teammate";

// driver is never connected, lookups are mocked
const driver = neo4j.driver(
  "bolt://localhost:7687",
  neo4j.auth.basic("neo4j", "unused"),
);

const found: MemoryWithTags = {
  id: TARGET,
  userId: "user_2xyzTeammateClerkId",
  profileId: PROFILE,
  title: "Deploys are gated on staging",
  content: "Nothing ships to production without a staging soak.",
  type: "knowledge",
  source: "agent",
  sourceType: null,
  sourceId: null,
  sourceUrl: null,
  sourceSyncedAt: null,
  confidence: 0.9,
  status: "active",
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
  expiresAt: null,
  tags: [],
};

function applyUpdate(scope: MemoryReadScope) {
  return applyFactUpdateOrDelete(driver, {
    scope,
    factText: "Deploys are gated on staging.",
    decision: { event: "UPDATE", id: TARGET, text: "Updated." },
    buildUpdateReason: () => "reason",
    buildDeleteReason: () => "reason",
  });
}

describe("applyFactUpdateOrDelete target lookup", () => {
  beforeEach(() => {
    vi.mocked(getMemory).mockReset().mockResolvedValue(null);
    vi.mocked(getMemoryForTeam).mockReset().mockResolvedValue(found);
  });

  it("resolves a team target by profile, not by caller", async () => {
    const outcome = await applyUpdate({ kind: "team", profileId: PROFILE });

    expect(outcome).toBe("update");
    expect(getMemoryForTeam).toHaveBeenCalledWith(driver, PROFILE, TARGET);
    expect(getMemory).not.toHaveBeenCalled();
  });

  it("resolves a personal target by caller, ignoring the profile", async () => {
    vi.mocked(getMemory).mockResolvedValue(found);

    const outcome = await applyUpdate({
      kind: "personal",
      userId: CLERK,
      profileId: PROFILE,
    });

    expect(outcome).toBe("update");
    // by user-id only so legacy memories with no profile still resolve
    expect(getMemory).toHaveBeenCalledWith(driver, CLERK, TARGET);
    expect(getMemoryForTeam).not.toHaveBeenCalled();
  });

  it("still reports a genuinely absent team target", async () => {
    vi.mocked(getMemoryForTeam).mockResolvedValue(null);

    expect(await applyUpdate({ kind: "team", profileId: PROFILE })).toBe(
      "missing-target",
    );
  });
});
