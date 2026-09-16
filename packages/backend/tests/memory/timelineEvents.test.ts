import { describe, expect, it } from "vitest";
import type { MemoryWithTags } from "@vmem/sdk";
import {
  clampTimelinePage,
  timelineEventFromMemory,
} from "../../convex/memoryApi/timelineEvents";

function memory(overrides: Partial<MemoryWithTags> = {}): MemoryWithTags {
  return {
    id: "mem_1",
    userId: "user_1",
    profileId: "profile_1",
    title: "Prefers pnpm",
    content: "Use pnpm in the vmem monorepo",
    type: "knowledge",
    source: "web",
    sourceType: "web",
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: 0.9,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    tags: ["tooling"],
    ...overrides,
  };
}

describe("clampTimelinePage", () => {
  it("clamps limit and offset to a sane page", () => {
    expect(clampTimelinePage(0, -4)).toEqual({ limit: 1, offset: 0 });
    expect(clampTimelinePage(12.9, 3.2)).toEqual({ limit: 12, offset: 3 });
    expect(clampTimelinePage(10_000, 2)).toEqual({ limit: 500, offset: 2 });
  });
});

describe("timelineEventFromMemory", () => {
  it("emits a created snapshot for a never-edited memory", () => {
    const event = timelineEventFromMemory(memory());
    expect(event.action).toBe("created");
    expect(event.actor).toBe("You");
    expect(event.memoryId).toBe("mem_1");
    expect(event.memoryTitle).toBe("Prefers pnpm");
    expect(event.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(event.snapshot).toEqual({
      title: "Prefers pnpm",
      content: "Use pnpm in the vmem monorepo",
      type: "knowledge",
      status: "active",
      confidence: 0.9,
      tags: ["tooling"],
    });
  });

  it("marks later edits as updated and can tag a topic trail", () => {
    const event = timelineEventFromMemory(
      memory({ updatedAt: "2026-02-01T00:00:00.000Z" }),
      { connectionType: "tag" },
    );
    expect(event.action).toBe("updated");
    expect(event.createdAt).toBe("2026-02-01T00:00:00.000Z");
    expect(event.connectionType).toBe("tag");
  });
});
