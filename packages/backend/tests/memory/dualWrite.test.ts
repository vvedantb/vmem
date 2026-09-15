import { describe, expect, it, vi } from "vitest";
import type { MemoryWithTags } from "@vmem/sdk";
import {
  dualWriteCreate,
  dualWriteDelete,
  dualWriteDeleteAllForUser,
  dualWriteDeleteTeamAsOwner,
  dualWriteUpdate,
  type DualWriteCtx,
} from "../../convex/neo4jActions/_memories/dualWrite";

const memory: MemoryWithTags = {
  id: "mem_neo4j",
  userId: "clerk_user_a",
  profileId: "profile_personal",
  title: "Prefers pnpm",
  content: "Use pnpm for vmem",
  type: "knowledge",
  source: "api",
  sourceType: null,
  sourceId: null,
  sourceUrl: null,
  sourceSyncedAt: null,
  confidence: 0.9,
  status: "active",
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  expiresAt: null,
  tags: ["tooling"],
};

function ctxWithMutation(
  runMutation: DualWriteCtx["runMutation"],
): DualWriteCtx {
  return { runMutation };
}

describe("memoryStore dual-write", () => {
  it("writes create/update/delete payloads through runMutation", async () => {
    const runMutation = vi.fn().mockResolvedValue(null);
    const ctx = ctxWithMutation(runMutation);

    await dualWriteCreate(ctx, memory, { url: "https://example.com" });
    await dualWriteUpdate(ctx, {
      userId: memory.userId,
      memoryId: memory.id,
      title: "Updated",
    });
    await dualWriteDelete(ctx, memory.userId, memory.id);
    await dualWriteDeleteTeamAsOwner(ctx, "profile_team", memory.id);
    await dualWriteDeleteAllForUser(ctx, memory.userId);

    expect(runMutation).toHaveBeenCalledTimes(5);
    expect(runMutation.mock.calls[0]?.[1]).toMatchObject({
      memoryId: "mem_neo4j",
      userId: "clerk_user_a",
      profileId: "profile_personal",
      url: "https://example.com",
    });
  });

  it("uses fallbackProfileId when the memory has no profile", async () => {
    const runMutation = vi.fn().mockResolvedValue(null);
    await dualWriteCreate(
      ctxWithMutation(runMutation),
      { ...memory, profileId: null },
      { fallbackProfileId: "profile_fallback" },
    );

    expect(runMutation.mock.calls[0]?.[1]).toMatchObject({
      profileId: "profile_fallback",
    });
  });

  it("does not throw when Convex dual-write fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runMutation = vi.fn().mockRejectedValue(new Error("convex down"));
    const ctx = ctxWithMutation(runMutation);

    await expect(dualWriteCreate(ctx, memory)).resolves.toBeUndefined();
    await expect(
      dualWriteUpdate(ctx, { userId: memory.userId, memoryId: memory.id }),
    ).resolves.toBeUndefined();
    await expect(
      dualWriteDelete(ctx, memory.userId, memory.id),
    ).resolves.toBeUndefined();
    await expect(
      dualWriteDeleteTeamAsOwner(ctx, "profile_team", memory.id),
    ).resolves.toBeUndefined();
    await expect(
      dualWriteDeleteAllForUser(ctx, memory.userId),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
