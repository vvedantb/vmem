import { describe, expect, it } from "vitest";
import {
  buildDreamSynthesisPrompt,
  buildMergeSynthesisPrompt,
  parseDreamSynthesisResponse,
  parseMergeSynthesisResponse,
  type DreamClusterMember,
} from "../engine/neo4j/dreamPrompt";

const CLUSTER_IDS = ["mem-1", "mem-2", "mem-3"];

function synthesisJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "insight",
    title: "I prefer edge runtimes",
    content: "I consistently reach for V8-isolate platforms.",
    reason: "Both memories mention isolates.",
    sourceMemoryIds: ["mem-1", "mem-2"],
    confidence: 0.8,
    ...overrides,
  });
}

describe("parseDreamSynthesisResponse — confidenceAdjustments", () => {
  it("accepts valid adjustments and clamps confidence into [0.05, 1]", () => {
    const parsed = parseDreamSynthesisResponse(
      synthesisJson({
        confidenceAdjustments: [
          { memoryId: "mem-1", newConfidence: 1.7, reason: "corroborated" },
          { memoryId: "mem-2", newConfidence: 0, reason: "contradicted" },
        ],
      }),
      CLUSTER_IDS,
    );
    expect(parsed?.confidenceAdjustments).toEqual([
      { memoryId: "mem-1", newConfidence: 1, reason: "corroborated" },
      { memoryId: "mem-2", newConfidence: 0.05, reason: "contradicted" },
    ]);
  });

  it("drops adjustments whose ids are not in the cluster", () => {
    const parsed = parseDreamSynthesisResponse(
      synthesisJson({
        confidenceAdjustments: [
          { memoryId: "invented-id", newConfidence: 0.9, reason: "x" },
          { memoryId: "mem-3", newConfidence: 0.4, reason: "y" },
        ],
      }),
      CLUSTER_IDS,
    );
    expect(parsed?.confidenceAdjustments).toEqual([
      { memoryId: "mem-3", newConfidence: 0.4, reason: "y" },
    ]);
  });

  it("dedupes adjustments to one per memory and tolerates malformed entries", () => {
    const parsed = parseDreamSynthesisResponse(
      synthesisJson({
        confidenceAdjustments: [
          { memoryId: "mem-1", newConfidence: 0.7, reason: "first" },
          { memoryId: "mem-1", newConfidence: 0.2, reason: "second" },
          { memoryId: "mem-2", newConfidence: "high", reason: "bad type" },
          "garbage",
        ],
      }),
      CLUSTER_IDS,
    );
    expect(parsed?.confidenceAdjustments).toEqual([
      { memoryId: "mem-1", newConfidence: 0.7, reason: "first" },
    ]);
  });

  it("keeps adjustments on a skip response", () => {
    const parsed = parseDreamSynthesisResponse(
      JSON.stringify({
        type: "skip",
        title: "",
        content: "",
        reason: "noise",
        sourceMemoryIds: [],
        confidence: 0,
        confidenceAdjustments: [
          { memoryId: "mem-2", newConfidence: 0.3, reason: "outdated" },
        ],
      }),
      CLUSTER_IDS,
    );
    expect(parsed?.type).toBe("skip");
    expect(parsed?.confidenceAdjustments).toEqual([
      { memoryId: "mem-2", newConfidence: 0.3, reason: "outdated" },
    ]);
  });

  it("returns an empty array when the field is absent", () => {
    const parsed = parseDreamSynthesisResponse(synthesisJson(), CLUSTER_IDS);
    expect(parsed?.confidenceAdjustments).toEqual([]);
  });
});

describe("buildDreamSynthesisPrompt — semantic relation", () => {
  it("renders semantic neighbours with their relation marker", () => {
    const cluster: DreamClusterMember[] = [
      {
        id: "mem-1",
        title: "Seed",
        content: "c",
        tags: [],
        relation: "anomaly",
      },
      {
        id: "mem-2",
        title: "Old note",
        content: "c",
        tags: [],
        relation: "semantic",
      },
    ];
    const prompt = buildDreamSynthesisPrompt(cluster);
    expect(prompt).toContain("(semantic)");
    expect(prompt).toContain("confidenceAdjustments");
  });
});

describe("parseMergeSynthesisResponse", () => {
  function mergeJson(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      type: "merge",
      title: "Consolidated note",
      content: "One memory covering both fragments.",
      sourceMemoryIds: ["mem-1", "mem-2"],
      confidence: 0.9,
      ...overrides,
    });
  }

  it("parses a valid merge", () => {
    expect(parseMergeSynthesisResponse(mergeJson(), CLUSTER_IDS)).toEqual({
      title: "Consolidated note",
      content: "One memory covering both fragments.",
      sourceMemoryIds: ["mem-1", "mem-2"],
      confidence: 0.9,
    });
  });

  it("returns null on skip", () => {
    expect(
      parseMergeSynthesisResponse(mergeJson({ type: "skip" }), CLUSTER_IDS),
    ).toBeNull();
  });

  it("returns null when fewer than 2 valid source ids survive", () => {
    expect(
      parseMergeSynthesisResponse(
        mergeJson({ sourceMemoryIds: ["mem-1", "invented"] }),
        CLUSTER_IDS,
      ),
    ).toBeNull();
  });

  it("returns null on empty title or content", () => {
    expect(
      parseMergeSynthesisResponse(mergeJson({ title: "  " }), CLUSTER_IDS),
    ).toBeNull();
    expect(
      parseMergeSynthesisResponse(mergeJson({ content: "" }), CLUSTER_IDS),
    ).toBeNull();
  });

  it("tolerates markdown code fences around the JSON", () => {
    const fenced = "```json\n" + mergeJson() + "\n```";
    expect(parseMergeSynthesisResponse(fenced, CLUSTER_IDS)).not.toBeNull();
  });
});

describe("buildMergeSynthesisPrompt", () => {
  it("renders every cluster member with its id", () => {
    const prompt = buildMergeSynthesisPrompt([
      { id: "mem-1", title: "A", content: "x" },
      { id: "mem-2", title: "B", content: "y" },
    ]);
    expect(prompt).toContain("id=mem-1");
    expect(prompt).toContain("id=mem-2");
    expect(prompt).toContain('"merge" | "skip"');
  });
});
