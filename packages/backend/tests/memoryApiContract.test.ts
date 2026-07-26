// AI-generated (Claude), prompt: "contract tests for memory api request schemas and sdk response parse"
// Modified by me: covered store update delete and structured bodies
import { describe, expect, it } from "vitest";
import {
  deleteBodySchema,
  parseMemoryWithTagsResponse,
  retrieveBodySchema,
  storeBodySchema,
  structuredStoreBodySchema,
  structuredUpdateBodySchema,
  updateBodySchema,
} from "@vmem/sdk";

const validStructuredStore = {
  title: "Prefers pnpm",
  content: "User prefers pnpm for the vmem monorepo",
  type: "profile",
  source: "manual",
  tags: ["tooling"],
  confidence: 0.9,
  expiresAt: "2030-01-01T00:00:00.000Z",
  url: "https://example.com",
  profileId: "profile_1",
  externalId: "ext-1",
  sourceType: "manual",
};

const validMemoryResponse = {
  id: "mem_1",
  userId: "user_1",
  profileId: "profile_1",
  title: "Prefers pnpm",
  content: "User prefers pnpm for the vmem monorepo",
  type: "profile",
  source: "manual",
  sourceType: "manual",
  sourceId: null,
  sourceUrl: null,
  sourceSyncedAt: null,
  confidence: 0.9,
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  tags: ["tooling"],
};

describe("memoryApi contract request schemas", () => {
  it("accepts structured store with HTTP-only fields and optional tags/confidence", () => {
    expect(
      structuredStoreBodySchema.safeParse(validStructuredStore).success,
    ).toBe(true);
    expect(
      structuredStoreBodySchema.safeParse({
        title: "x",
        content: "y",
        type: "knowledge",
        source: "api",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid store type and unbounded confidence", () => {
    expect(
      structuredStoreBodySchema.safeParse({
        ...validStructuredStore,
        type: "banana",
      }).success,
    ).toBe(false);
    expect(
      structuredStoreBodySchema.safeParse({
        ...validStructuredStore,
        confidence: 1.5,
      }).success,
    ).toBe(false);
    expect(
      structuredStoreBodySchema.safeParse({
        ...validStructuredStore,
        confidence: -0.1,
      }).success,
    ).toBe(false);
  });

  it("accepts instruction store and rejects empty instruction", () => {
    expect(
      storeBodySchema.safeParse({ instruction: "Remember dark mode" }).success,
    ).toBe(true);
    expect(storeBodySchema.safeParse({ instruction: "" }).success).toBe(false);
  });

  it("bounds retrieve limit and enums type", () => {
    expect(
      retrieveBodySchema.safeParse({
        query: "pnpm",
        type: "episodic",
        limit: 50,
        summarize: true,
      }).success,
    ).toBe(true);
    expect(
      retrieveBodySchema.safeParse({ query: "pnpm", limit: 51 }).success,
    ).toBe(false);
    expect(
      retrieveBodySchema.safeParse({ query: "pnpm", limit: 0 }).success,
    ).toBe(false);
    expect(
      retrieveBodySchema.safeParse({ query: "pnpm", type: "banana" }).success,
    ).toBe(false);
  });

  it("uses id for structured update/delete and enums status", () => {
    expect(
      structuredUpdateBodySchema.safeParse({
        id: "mem_1",
        status: "pinned",
        confidence: 0.5,
        expiresAt: null,
      }).success,
    ).toBe(true);
    expect(
      structuredUpdateBodySchema.safeParse({
        memoryId: "mem_1",
        title: "x",
      }).success,
    ).toBe(false);
    expect(
      structuredUpdateBodySchema.safeParse({
        id: "mem_1",
        status: "archived",
      }).success,
    ).toBe(false);
    expect(deleteBodySchema.safeParse({ id: "mem_1" }).success).toBe(true);
    expect(deleteBodySchema.safeParse({ memoryId: "mem_1" }).success).toBe(
      false,
    );
  });

  it("accepts instruction update via updateBodySchema", () => {
    expect(
      updateBodySchema.safeParse({
        instruction: "User no longer uses yarn",
        profileId: "profile_1",
      }).success,
    ).toBe(true);
  });
});

describe("SDK response validators vs MemoryWithTags shape", () => {
  it("accepts a backend-shaped memory response", () => {
    expect(() =>
      parseMemoryWithTagsResponse(validMemoryResponse),
    ).not.toThrow();
  });

  it("rejects responses missing profile/source fields", () => {
    expect(() =>
      parseMemoryWithTagsResponse({
        id: "mem_1",
        userId: "user_1",
        title: "Prefers pnpm",
        content: "User prefers pnpm for the vmem monorepo",
        type: "profile",
        source: "manual",
        sourceType: "manual",
        sourceId: null,
        sourceUrl: null,
        sourceSyncedAt: null,
        confidence: 0.9,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
        tags: ["tooling"],
      }),
    ).toThrow();

    expect(() =>
      parseMemoryWithTagsResponse({
        id: "mem_1",
        userId: "user_1",
        profileId: "profile_1",
        title: "Prefers pnpm",
        content: "User prefers pnpm for the vmem monorepo",
        type: "profile",
        source: "manual",
        sourceId: null,
        sourceUrl: null,
        sourceSyncedAt: null,
        confidence: 0.9,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
        tags: ["tooling"],
      }),
    ).toThrow();
  });
});
