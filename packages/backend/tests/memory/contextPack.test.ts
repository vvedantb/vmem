import { describe, expect, it } from "vitest";
import type { MemoryCandidate } from "@vmem/sdk";
import { buildContextPack } from "../../engine/memory/contextPack";

function candidate(
  id: string,
  title: string,
  content: string,
): MemoryCandidate {
  return {
    id,
    userId: "user_a",
    profileId: "profile_a",
    title,
    content,
    type: "knowledge",
    source: "mcp",
    sourceType: null,
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: 1,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    tags: [],
    trace: {
      score: 0.9,
      scoreBreakdown: {
        fulltext: 1,
        vector: 0,
        chunk: 0,
        entity: 0,
        rrf: 0,
        recency: 0,
        temporal: 0,
        confidence: 1,
      },
      reason: "fulltext match",
    },
  };
}

const PROFILE = [
  "# vmem User Profile",
  "",
  "## About",
  "Builds vmem.",
  "",
  "## Available Skills",
  "- **deploy**: ship it",
].join("\n");

describe("buildContextPack", () => {
  it("orders memories, skills, then profile and drops the profile skills index", () => {
    const pack = buildContextPack({
      task: "set up the monorepo",
      memories: [candidate("m1", "Prefers pnpm", "Use pnpm workspaces")],
      skills: [{ name: "monorepo-setup", description: "Bootstrap a repo" }],
      profile: PROFILE,
      maxChars: 8000,
    });
    expect(pack.memoryIds).toEqual(["m1"]);
    expect(pack.skillNames).toEqual(["monorepo-setup"]);
    expect(pack.includesProfile).toBe(true);
    expect(pack.truncated).toBe(false);
    const md = pack.markdown;
    expect(md).toContain("Task: set up the monorepo");
    expect(md).toContain("**Prefers pnpm** (id: m1, knowledge)");
    expect(md).toContain("_why: fulltext match_");
    expect(md.indexOf("## Relevant memories")).toBeLessThan(
      md.indexOf("## Suggested skills"),
    );
    expect(md.indexOf("## Suggested skills")).toBeLessThan(
      md.indexOf("# vmem User Profile"),
    );
    expect(md).toContain("Builds vmem.");
    expect(md).not.toContain("## Available Skills");
  });

  it("stays within budget, keeps the top hit, and flags the cut", () => {
    const long = "word ".repeat(200).trim();
    const memories = Array.from({ length: 10 }, (_, i) =>
      candidate(`m${String(i)}`, `Memory ${String(i)}`, long),
    );
    const pack = buildContextPack({
      task: "anything",
      memories,
      skills: [{ name: "s", description: "d" }],
      profile: PROFILE,
      maxChars: 1500,
    });
    expect(pack.markdown.length).toBeLessThanOrEqual(1500);
    expect(pack.memoryIds[0]).toBe("m0");
    expect(pack.memoryIds.length).toBeLessThan(10);
    expect(pack.truncated).toBe(true);
    expect(pack.markdown).toContain("…");
  });

  it("says so when nothing matched and omits empty sections", () => {
    const pack = buildContextPack({
      task: "unknown",
      memories: [],
      skills: [],
      profile: null,
      maxChars: 1000,
    });
    expect(pack.markdown).toContain("_No relevant memories found._");
    expect(pack.markdown).not.toContain("## Suggested skills");
    expect(pack.includesProfile).toBe(false);
    expect(pack.truncated).toBe(false);
  });
});
