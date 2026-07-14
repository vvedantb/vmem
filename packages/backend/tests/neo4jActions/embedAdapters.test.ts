import { beforeEach, describe, expect, it, vi } from "vitest";

const { bestEffortEmbedOne, bestEffortEmbedMany } = vi.hoisted(() => ({
  bestEffortEmbedOne: vi.fn(),
  bestEffortEmbedMany: vi.fn(),
}));

vi.mock("../../convex/lib/openRouter/bestEffortEmbed", () => ({
  bestEffortEmbedOne,
  bestEffortEmbedMany,
}));

import {
  tryEmbedMany,
  tryEmbedOne,
} from "../../convex/neo4jActions/_memories/shared";
import type { ActionCtx } from "../../convex/_generated/server";

function mockActionCtx(): ActionCtx {
  return {
    runQuery: vi.fn(),
    runMutation: vi.fn(),
    runAction: vi.fn(),
    scheduler: {
      runAfter: vi.fn(),
      runAt: vi.fn(),
      cancel: vi.fn(),
    },
    auth: {
      getUserIdentity: vi.fn(),
    },
    storage: {
      getUrl: vi.fn(),
      getMetadata: vi.fn(),
      generateUploadUrl: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
      store: vi.fn(),
    },
    vectorSearch: vi.fn(),
    meta: {
      getFunctionMetadata: vi.fn(),
      getDeploymentMetadata: vi.fn(),
      getRequestMetadata: vi.fn(),
    },
  };
}

describe("tryEmbed adapters", () => {
  beforeEach(() => {
    bestEffortEmbedOne.mockReset();
    bestEffortEmbedMany.mockReset();
    bestEffortEmbedOne.mockResolvedValue([0.1]);
    bestEffortEmbedMany.mockResolvedValue([[0.1], [0.2]]);
  });

  it("tryEmbedOne forwards ActionCtx as params.ctx", async () => {
    const ctx = mockActionCtx();

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
    const ctx = mockActionCtx();

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
