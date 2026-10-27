import { describe, expect, it } from "vitest";
import {
  buildClusterMergePrompt,
  CLUSTER_MERGE_CONTENT_CHARS,
  parseClusterMergeReply,
  type ClusterMergeMember,
} from "../../engine/memory/dream/clusterMerge";

type Member = ClusterMergeMember<string>;

function member(id: string, fields: Partial<Member> = {}): Member {
  const content = fields.content ?? `Content of ${id}`;
  return {
    id,
    title: `Title ${id}`,
    content,
    contentLength: content.length,
    status: "active",
    createdAt: Date.parse("2026-10-01T00:00:00Z"),
    ...fields,
  };
}

const memberA = member("row_a", {
  title: "Uses pnpm",
  content: "Uses pnpm in vmem.",
});
const memberB = member("row_b", {
  title: "Prefers pnpm",
  content: "Prefers pnpm 10.",
});
const memberC = member("row_c", {
  title: "pnpm",
  content: "pnpm workspaces for vmem.",
});
const trio = [memberA, memberB, memberC];

function reply(fields: Record<string, unknown>): string {
  return JSON.stringify({
    duplicate: true,
    keepId: "m0",
    removeIds: ["m1", "m2"],
    mergedTitle: "Uses pnpm",
    mergedContent: "Uses pnpm 10 with workspaces in vmem.",
    confidence: 0.92,
    reason: "Same tool preference.",
    ...fields,
  });
}

describe("buildClusterMergePrompt", () => {
  it("names members m0..mN, never by row id, and marks pinned rows", () => {
    const prompt = buildClusterMergePrompt([
      ...trio,
      member("row_d", { title: "Pinned", content: "x", status: "pinned" }),
    ]);
    for (const key of ["m0", "m1", "m2", "m3"]) {
      expect(prompt).toContain(`"id": "${key}"`);
    }
    expect(prompt).not.toContain("row_");
    expect(prompt.match(/"pinned": true/g)).toHaveLength(1);
    expect(prompt).toContain("mergedContent");
    expect(prompt).toContain("Do not add facts");
  });

  it("cuts long content at a word", () => {
    const long = "word ".repeat(2_000);
    const prompt = buildClusterMergePrompt([
      member("row_a", { content: long }),
      member("row_b"),
    ]);
    expect(prompt.length).toBeLessThan(CLUSTER_MERGE_CONTENT_CHARS + 3_000);
  });
});

describe("parseClusterMergeReply", () => {
  it("flags the cluster with the keeper, the losers and the merged text", () => {
    expect(parseClusterMergeReply(trio, reply({}))).toEqual({
      status: "flagged",
      keeperId: "row_a",
      removeIds: ["row_b", "row_c"],
      merged: {
        title: "Uses pnpm",
        content: "Uses pnpm 10 with workspaces in vmem.",
      },
      reason: "Same tool preference",
      confidence: 0.92,
    });
  });

  it("drops members the AI leaves out and ignores unknown or repeated ids", () => {
    const verdict = parseClusterMergeReply(
      trio,
      reply({ keepId: "m1", removeIds: ["m0", "m0", "m1", "m9"] }),
    );
    expect(verdict).toMatchObject({
      status: "flagged",
      keeperId: "row_b",
      removeIds: ["row_a"],
    });
  });

  it("never removes a pinned row, and lets a pinned row be the keeper", () => {
    const pinned: Member[] = [
      memberA,
      { ...memberB, status: "pinned" },
      memberC,
    ];
    expect(parseClusterMergeReply(pinned, reply({}))).toMatchObject({
      status: "flagged",
      keeperId: "row_a",
      removeIds: ["row_c"],
    });
    expect(
      parseClusterMergeReply(
        pinned,
        reply({ keepId: "m1", removeIds: ["m0", "m2"] }),
      ),
    ).toMatchObject({
      status: "flagged",
      keeperId: "row_b",
      removeIds: ["row_a", "row_c"],
    });
    expect(
      parseClusterMergeReply(pinned, reply({ removeIds: ["m1"] })),
    ).toEqual({
      status: "not_duplicate",
      reason: "Nothing safe to remove",
      confidence: 0.92,
    });
  });

  it("is not a duplicate when the AI says so or is not sure", () => {
    expect(
      parseClusterMergeReply(
        trio,
        JSON.stringify({
          duplicate: false,
          confidence: 0.8,
          reason: "Different projects",
        }),
      ),
    ).toEqual({
      status: "not_duplicate",
      reason: "Different projects",
      confidence: 0.8,
    });
    expect(
      parseClusterMergeReply(trio, reply({ confidence: 0.4 })).status,
    ).toBe("not_duplicate");
    expect(parseClusterMergeReply(trio, reply({ removeIds: [] }))).toEqual({
      status: "not_duplicate",
      reason: "Nothing safe to remove",
      confidence: 0.92,
    });
  });

  it("reports malformed, empty and out-of-cluster replies as errors", () => {
    expect(parseClusterMergeReply(trio, null)).toEqual({
      status: "error",
      reason: "empty reply",
    });
    expect(parseClusterMergeReply(trio, "not json at all").status).toBe(
      "error",
    );
    expect(parseClusterMergeReply(trio, reply({ confidence: 3 })).status).toBe(
      "error",
    );
    expect(parseClusterMergeReply(trio, reply({ keepId: "m7" }))).toEqual({
      status: "error",
      reason: "keeper not in group",
    });
    expect(
      parseClusterMergeReply(trio, reply({ mergedContent: "  " })),
    ).toEqual({ status: "error", reason: "no merged text" });
  });

  it("reads JSON inside a fenced reply", () => {
    const fenced = `\`\`\`json\n${reply({})}\n\`\`\``;
    expect(parseClusterMergeReply(trio, fenced).status).toBe("flagged");
  });

  it("keeps no merged text when a merged member was too long to see", () => {
    const long = member("row_long", {
      content: "x".repeat(CLUSTER_MERGE_CONTENT_CHARS),
      contentLength: CLUSTER_MERGE_CONTENT_CHARS + 500,
    });
    const verdict = parseClusterMergeReply(
      [memberA, long],
      reply({ removeIds: ["m1"], mergedContent: null }),
    );
    expect(verdict).toEqual({
      status: "flagged",
      keeperId: "row_a",
      removeIds: ["row_long"],
      reason: "Same tool preference",
      confidence: 0.92,
    });
    // a long member the AI leaves out does not matter
    expect(
      parseClusterMergeReply(
        [...trio, long],
        reply({ removeIds: ["m1", "m2"] }),
      ),
    ).toHaveProperty("merged");
  });
});
