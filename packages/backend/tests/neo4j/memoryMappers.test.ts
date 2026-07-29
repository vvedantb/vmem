// AI-generated (Claude), prompt: "unit tests for neo4j memory record mappers and tag normalize"
// Modified by me: normalized nullish legacy fields on memory with tags
import { describe, expect, it } from "vitest";
import neo4j from "neo4j-driver";
import { z } from "zod";
import {
  toMemoryWithTags,
  toSnapshot,
} from "../../engine/neo4j/memory/mappers";
import { normalizeTags } from "../../engine/neo4j/memory/tagNormalize";

const snapshotTagsSchema = z.object({ tags: z.array(z.string()) });

function memoryNodeRecord(props: Record<string, unknown>, tags: unknown) {
  return new neo4j.Record(["m", "tags"], [{ properties: props }, tags]);
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
    const snapshot = snapshotTagsSchema.parse(
      JSON.parse(
        toSnapshot({
          title: "T",
          content: "C",
          type: "knowledge",
          status: "active",
          confidence: 0.5,
          tags: originalTags,
        }),
      ),
    );

    expect(snapshot.tags).toEqual(originalTags);
    expect(normalizeTags(originalTags)).toEqual(["super-cars", "typescript"]);
    expect(snapshot.tags).not.toEqual(normalizeTags(originalTags));
  });
});
