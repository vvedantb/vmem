import { describe, expect, it } from "vitest";
import type { Record as NeoRecord } from "neo4j-driver";
import {
  toMemoryWithTags,
  toSnapshot,
} from "../../engine/neo4j/memory/mappers";
import { normalizeTags } from "../../engine/neo4j/memory/tagNormalize";

function memoryNodeRecord(
  props: Record<string, unknown>,
  tags: unknown,
): NeoRecord {
  return {
    get: (key: string) => (key === "m" ? { properties: props } : tags),
    keys: ["m", "tags"],
    length: 2,
  } as NeoRecord;
}

describe("toMemoryWithTags", () => {
  it("spreads validated node props and normalizes nullish legacy fields", () => {
    const record = memoryNodeRecord(
      {
        id: "mem_1",
        userId: "user_1",
        profileId: undefined,
        title: "Title",
        content: "Body",
        type: "knowledge",
        source: "api",
        sourceType: undefined,
        sourceId: null,
        sourceUrl: undefined,
        sourceSyncedAt: null,
        confidence: 0.8,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        expiresAt: undefined,
      },
      ["alpha"],
    );

    expect(toMemoryWithTags(record)).toEqual({
      id: "mem_1",
      userId: "user_1",
      profileId: null,
      title: "Title",
      content: "Body",
      type: "knowledge",
      source: "api",
      sourceType: null,
      sourceId: null,
      sourceUrl: null,
      sourceSyncedAt: null,
      confidence: 0.8,
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      expiresAt: null,
      tags: ["alpha"],
    });
  });
});

describe("characterization: creation snapshots retain original tags", () => {
  it("toSnapshot keeps caller tags while storage uses normalizeTags", () => {
    const originalTags = ["Super Cars", "TypeScript!!!"];
    const snapshot = JSON.parse(
      toSnapshot({
        title: "T",
        content: "C",
        type: "knowledge",
        status: "active",
        confidence: 0.5,
        tags: originalTags,
      }),
    ) as { tags: string[] };

    expect(snapshot.tags).toEqual(originalTags);
    expect(normalizeTags(originalTags)).toEqual(["super-cars", "typescript"]);
    expect(snapshot.tags).not.toEqual(normalizeTags(originalTags));
  });
});
