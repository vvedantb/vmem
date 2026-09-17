import { describe, expect, it } from "vitest";
import {
  decideFactDeterministic,
  findExactHashMatch,
  instructionContentHash,
  instructionTitle,
  textJaccard,
  visibleDecisionCandidates,
} from "../../engine/memory/supersede";
import type { MemoryWithTags } from "@vmem/sdk";

function candidate(
  id: string,
  title: string,
  content: string,
): { id: string; title: string; content: string } {
  return { id, title, content };
}

describe("instructionTitle", () => {
  it("trims and caps at 80 characters", () => {
    expect(instructionTitle("  Prefer pnpm  ")).toBe("Prefer pnpm");
    expect(instructionTitle("x".repeat(90))).toHaveLength(80);
  });
});

describe("decideFactDeterministic", () => {
  const python = candidate("mem_py", "I prefer Python", "I prefer Python");
  const pnpm = candidate("mem_pnpm", "Use pnpm for vmem", "Use pnpm for vmem");

  it("returns NONE for an exact hash match", () => {
    const text = "Use pnpm for vmem";
    expect(findExactHashMatch(text, [pnpm])?.id).toBe("mem_pnpm");
    expect(instructionContentHash(text)).toHaveLength(32);
    expect(decideFactDeterministic(text, [python, pnpm])).toEqual({
      event: "NONE",
      targetId: "mem_pnpm",
      text,
    });
  });

  it("returns UPDATE for high token overlap", () => {
    const decision = decideFactDeterministic("Use pnpm for the vmem monorepo", [
      pnpm,
      python,
    ]);
    expect(decision.event).toBe("UPDATE");
    expect(decision.targetId).toBe("mem_pnpm");
  });

  it("returns ADD when nothing is similar", () => {
    const decision = decideFactDeterministic("I live in London", [
      python,
      pnpm,
    ]);
    expect(decision.event).toBe("ADD");
    expect(decision.targetId).toBeUndefined();
  });
});

describe("textJaccard", () => {
  it("is 1 for identical token sets and 0 for disjoint", () => {
    expect(
      textJaccard(
        { title: "Prefers pnpm", content: "Use pnpm" },
        { title: "Prefers pnpm", content: "Use pnpm" },
      ),
    ).toBe(1);
    expect(
      textJaccard(
        { title: "Python", content: "I prefer Python" },
        { title: "London", content: "I live in London" },
      ),
    ).toBe(0);
  });
});

describe("visibleDecisionCandidates", () => {
  it("drops suppressed rows", () => {
    const active: MemoryWithTags = {
      id: "a",
      userId: "u",
      profileId: "p",
      title: "Prefers pnpm",
      content: "Use pnpm",
      type: "knowledge",
      source: "api",
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
    };
    const hidden = { ...active, id: "b", status: "suppressed" as const };
    expect(
      visibleDecisionCandidates([active, hidden]).map((row) => row.id),
    ).toEqual(["a"]);
  });
});
