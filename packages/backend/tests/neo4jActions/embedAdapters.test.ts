import { beforeEach, describe, expect, it, vi } from "vitest";

const bestEffortEmbedOne = vi.fn();
const bestEffortEmbedMany = vi.fn();

vi.mock("../../convex/lib/openRouter/bestEffortEmbed", () => ({
  bestEffortEmbedOne: (...callArgs: unknown[]) =>
    bestEffortEmbedOne(...callArgs),
  bestEffortEmbedMany: (...callArgs: unknown[]) =>
    bestEffortEmbedMany(...callArgs),
}));

import {
  tryEmbedMany,
  tryEmbedOne,
} from "../../convex/neo4jActions/_memories/shared";

describe("tryEmbed adapters", () => {
  beforeEach(() => {
    bestEffortEmbedOne.mockReset();
    bestEffortEmbedMany.mockReset();
    bestEffortEmbedOne.mockResolvedValue([0.1]);
    bestEffortEmbedMany.mockResolvedValue([[0.1], [0.2]]);
  });

  it("tryEmbedOne forwards ActionCtx as params.ctx", async () => {
    const ctx = { runQuery: vi.fn(), runMutation: vi.fn(), scheduler: {} };

    await tryEmbedOne(ctx, {
      clerkId: "user_abc",
      profileId: "prof_1",
      feature: "memory-search",
      text: "hello",
      failureLog: "test",
    });

    expect(bestEffortEmbedOne).toHaveBeenCalledOnce();
    expect(bestEffortEmbedOne).toHaveBeenCalledWith({
      ctx,
      clerkId: "user_abc",
      profileId: "prof_1",
      feature: "memory-search",
      text: "hello",
      failureLog: "test",
    });
  });

  it("tryEmbedMany forwards ActionCtx as params.ctx", async () => {
    const ctx = { runQuery: vi.fn(), runMutation: vi.fn(), scheduler: {} };

    await tryEmbedMany(ctx, {
      clerkId: "user_abc",
      feature: "memory-save",
      texts: ["a", "b"],
      failureLog: "test",
    });

    expect(bestEffortEmbedMany).toHaveBeenCalledOnce();
    expect(bestEffortEmbedMany).toHaveBeenCalledWith({
      ctx,
      clerkId: "user_abc",
      feature: "memory-save",
      texts: ["a", "b"],
      failureLog: "test",
    });
  });
});
