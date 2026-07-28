import { describe, expect, it } from "vitest";
import {
  recencyFromAgeDays,
  rrfScore,
  toMemoryStatusOrUndefined,
  toMemoryTypeOrUndefined,
} from "../../engine/neo4j/memory/mappers";

describe("rrfScore", () => {
  it("assigns a higher score to better ranks", () => {
    expect(rrfScore(1)).toBeGreaterThan(rrfScore(5));
    expect(rrfScore(5)).toBeGreaterThan(rrfScore(20));
  });

  it("uses the standard RRF formula with k=60 by default", () => {
    expect(rrfScore(1)).toBeCloseTo(1 / 61);
    expect(rrfScore(3, 10)).toBeCloseTo(1 / 13);
  });
});

describe("recencyFromAgeDays", () => {
  it("never decays profile memories by age", () => {
    expect(recencyFromAgeDays(0, "profile")).toBe(1);
    expect(recencyFromAgeDays(365, "profile")).toBe(1);
  });

  it("applies knowledge decay buckets", () => {
    expect(recencyFromAgeDays(3, "knowledge")).toBe(1);
    expect(recencyFromAgeDays(14, "knowledge")).toBe(0.9);
    expect(recencyFromAgeDays(45, "knowledge")).toBe(0.7);
    expect(recencyFromAgeDays(120, "knowledge")).toBe(0.5);
  });

  it("applies episodic decay buckets", () => {
    expect(recencyFromAgeDays(0.5, "episodic")).toBe(1);
    expect(recencyFromAgeDays(3, "episodic")).toBe(0.9);
    expect(recencyFromAgeDays(10, "episodic")).toBe(0.7);
    expect(recencyFromAgeDays(45, "episodic")).toBe(0.5);
    expect(recencyFromAgeDays(120, "episodic")).toBe(0.3);
  });
});

describe("toMemoryTypeOrUndefined", () => {
  it("accepts known memory types", () => {
    expect(toMemoryTypeOrUndefined("profile")).toBe("profile");
    expect(toMemoryTypeOrUndefined("episodic")).toBe("episodic");
    expect(toMemoryTypeOrUndefined("knowledge")).toBe("knowledge");
  });

  it("returns undefined for null and unknown values", () => {
    expect(toMemoryTypeOrUndefined(null)).toBeUndefined();
    expect(toMemoryTypeOrUndefined(undefined)).toBeUndefined();
    expect(toMemoryTypeOrUndefined("semantic")).toBeUndefined();
  });
});

describe("toMemoryStatusOrUndefined", () => {
  it("accepts known memory statuses", () => {
    expect(toMemoryStatusOrUndefined("active")).toBe("active");
    expect(toMemoryStatusOrUndefined("pinned")).toBe("pinned");
    expect(toMemoryStatusOrUndefined("suppressed")).toBe("suppressed");
    expect(toMemoryStatusOrUndefined("expired")).toBe("expired");
  });

  it("returns undefined for null and unknown values", () => {
    expect(toMemoryStatusOrUndefined(null)).toBeUndefined();
    expect(toMemoryStatusOrUndefined(undefined)).toBeUndefined();
    expect(toMemoryStatusOrUndefined("archived")).toBeUndefined();
  });
});
