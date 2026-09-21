import { describe, expect, it, vi } from "vitest";
import type { SystemOneResponse } from "../../engine/llm/systemOneClient";
import { JEV_BEST_NONE } from "../../engine/memory/jevGate";
import {
  JEV_AUTO_ACCEPT_NOUL,
  JEV_KEEPER_OVERRIDE_CONFIDENCE,
  JEV_MERGE_APPROVE_NOUL,
  JEV_MERGE_REJECT_NOUL,
  applyJevMergeGate,
  buildJevMergeQuestions,
  clusterSourceKey,
  judgeDreamMergeClusters,
  type MergeGateMemory,
} from "../../engine/memory/jevMergeGate";

const shortMem: MergeGateMemory = {
  id: "dup_a",
  title: "Use pnpm for vmem",
  content: "Use pnpm",
  updatedAt: "2026-02-01T00:00:00.000Z",
};
const longMem: MergeGateMemory = {
  id: "dup_b",
  title: "Use pnpm for vmem",
  content: "Use pnpm for the vmem monorepo",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mergeResponse(overrides: {
  merge?: number;
  keeper?: string;
  keeperConfidence?: number;
  autoAccept?: number;
}): SystemOneResponse {
  return {
    model: "jev-latest",
    answers: {
      merge: { type: "noul", noul: overrides.merge ?? 0.9 },
      keeper: {
        type: "choice",
        choice: overrides.keeper ?? "h1",
        probabilities: { h0: 0.2, h1: 0.7, none: 0.1 },
        confidence: overrides.keeperConfidence ?? 0.8,
      },
      auto_accept: {
        type: "noul",
        noul: overrides.autoAccept ?? 0.4,
      },
    },
  };
}

describe("buildJevMergeQuestions", () => {
  it("packs merge noul, keeper choice, and auto-accept noul", () => {
    const questions = buildJevMergeQuestions([shortMem, longMem]);
    expect(questions.merge).toEqual({
      type: "noul",
      instructions:
        "Are these memories true near-duplicates of the same fact, worth merging into one record?",
      criteria: {
        true: "Same fact or current truth vs a stale copy; merging would not drop a distinct belief",
        false: "Different facts, different time windows, or only lexical overlap",
      },
    });
    expect(questions.auto_accept?.type).toBe("noul");
    expect(questions.keeper).toMatchObject({
      type: "choice",
      criteria: expect.objectContaining({
        [JEV_BEST_NONE]: expect.stringContaining("heuristic keeper"),
        h0: expect.stringContaining("Use pnpm"),
        h1: expect.stringContaining("vmem monorepo"),
      }),
    });
  });
});

describe("applyJevMergeGate", () => {
  it("rejects a cluster when merge noul is at or below the reject floor", async () => {
    const evaluate = vi.fn(async () => mergeResponse({ merge: 0.2 }));
    const decision = await applyJevMergeGate({
      memories: [shortMem, longMem],
      heuristicKeeperId: longMem.id,
      autoAccept: true,
      apiKey: "test-key",
      evaluate,
    });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(decision.outcome).toBe("reject");
    expect(decision.keeperId).toBe(longMem.id);
    expect(decision.safeToAutoAccept).toBe(false);
    expect(decision.mergeNoul).toBe(0.2);
    expect(JEV_MERGE_REJECT_NOUL).toBe(0.35);
  });

  it("skips as abstain when merge noul sits between reject and approve", async () => {
    const decision = await applyJevMergeGate({
      memories: [shortMem, longMem],
      heuristicKeeperId: longMem.id,
      autoAccept: false,
      apiKey: "test-key",
      evaluate: async () => mergeResponse({ merge: 0.5 }),
    });
    expect(decision.outcome).toBe("abstain");
    expect(decision.safeToAutoAccept).toBe(false);
    expect(JEV_MERGE_APPROVE_NOUL).toBe(0.65);
  });

  it("honors Jev's keeper when confidence is high enough", async () => {
    const decision = await applyJevMergeGate({
      memories: [shortMem, longMem],
      heuristicKeeperId: longMem.id,
      autoAccept: false,
      apiKey: "test-key",
      evaluate: async () =>
        mergeResponse({
          merge: 0.88,
          keeper: "h0",
          keeperConfidence: 0.72,
        }),
    });
    expect(decision.outcome).toBe("approve");
    expect(decision.keeperId).toBe(shortMem.id);
    expect(decision.keeperConfidence).toBe(0.72);
    expect(JEV_KEEPER_OVERRIDE_CONFIDENCE).toBe(0.6);
  });

  it("keeps the heuristic keeper when Jev confidence is below the override floor", async () => {
    const decision = await applyJevMergeGate({
      memories: [shortMem, longMem],
      heuristicKeeperId: longMem.id,
      autoAccept: false,
      apiKey: "test-key",
      evaluate: async () =>
        mergeResponse({
          merge: 0.9,
          keeper: "h0",
          keeperConfidence: 0.4,
        }),
    });
    expect(decision.outcome).toBe("approve");
    expect(decision.keeperId).toBe(longMem.id);
  });

  it("requires a high auto-accept noul before marking the merge safe to materialize", async () => {
    const unsafe = await applyJevMergeGate({
      memories: [shortMem, longMem],
      heuristicKeeperId: longMem.id,
      autoAccept: true,
      apiKey: "test-key",
      evaluate: async () =>
        mergeResponse({ merge: 0.9, keeper: "h1", autoAccept: 0.4 }),
    });
    const safe = await applyJevMergeGate({
      memories: [shortMem, longMem],
      heuristicKeeperId: longMem.id,
      autoAccept: true,
      apiKey: "test-key",
      evaluate: async () =>
        mergeResponse({ merge: 0.9, keeper: "h1", autoAccept: 0.85 }),
    });
    expect(unsafe.safeToAutoAccept).toBe(false);
    expect(safe.safeToAutoAccept).toBe(true);
    expect(JEV_AUTO_ACCEPT_NOUL).toBe(0.7);
  });

  it("fail-opens to the heuristic keeper when Jev throws", async () => {
    const decision = await applyJevMergeGate({
      memories: [shortMem, longMem],
      heuristicKeeperId: longMem.id,
      autoAccept: true,
      apiKey: "test-key",
      evaluate: async () => {
        throw new Error("network");
      },
    });
    expect(decision.outcome).toBe("fail-open");
    expect(decision.keeperId).toBe(longMem.id);
    expect(decision.safeToAutoAccept).toBe(true);
  });

  it("fail-opens when merge noul is missing from the response", async () => {
    const decision = await applyJevMergeGate({
      memories: [shortMem, longMem],
      heuristicKeeperId: longMem.id,
      autoAccept: false,
      apiKey: "test-key",
      evaluate: async () => ({
        model: "jev-latest",
        answers: {
          keeper: {
            type: "choice",
            choice: "h0",
            probabilities: { h0: 1 },
            confidence: 0.9,
          },
        },
      }),
    });
    expect(decision.outcome).toBe("fail-open");
    expect(decision.keeperId).toBe(longMem.id);
    expect(decision.safeToAutoAccept).toBe(false);
  });
});

describe("judgeDreamMergeClusters", () => {
  it("skips Jev and fail-opens every cluster when the TypeSafe key is missing", async () => {
    const evaluate = vi.fn(async () => mergeResponse({ merge: 0.2 }));
    const decisions = await judgeDreamMergeClusters({
      clusters: [
        {
          memories: [shortMem, longMem],
          heuristicKeeperId: longMem.id,
        },
      ],
      autoAccept: true,
      apiKey: undefined,
      evaluate,
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(decisions).toEqual([
      {
        sourceMemoryIds: [shortMem.id, longMem.id],
        outcome: "fail-open",
        keeperId: longMem.id,
        safeToAutoAccept: true,
      },
    ]);
  });

  it("stable-keys a cluster by sorted source ids", () => {
    expect(clusterSourceKey(["b", "a"])).toBe(clusterSourceKey(["a", "b"]));
    expect(clusterSourceKey(["a", "b"])).not.toBe(clusterSourceKey(["a", "c"]));
  });
});
