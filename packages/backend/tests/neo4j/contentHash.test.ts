import { describe, expect, it } from "vitest";
import { computeContentHash } from "../../engine/neo4j/memory/mappers";

describe("computeContentHash", () => {
  it("returns the same hash when title and content differ only by whitespace and casing", () => {
    const baseline = computeContentHash(
      "Meeting Notes",
      "Discussed  vmem  roadmap.",
    );
    const reformatted = computeContentHash(
      "  meeting notes  ",
      "Discussed vmem roadmap.",
    );

    expect(reformatted).toBe(baseline);
  });

  it("returns different hashes when substantive content differs", () => {
    const first = computeContentHash("Title", "First body");
    const second = computeContentHash("Title", "Second body");

    expect(second).not.toBe(first);
  });

  it("returns different hashes when only the title differs", () => {
    const first = computeContentHash("Alpha", "Same body");
    const second = computeContentHash("Beta", "Same body");

    expect(second).not.toBe(first);
  });

  it("returns a stable 32-character hex digest", () => {
    const hash = computeContentHash("Stable", "content");

    expect(hash).toMatch(/^[a-f0-9]{32}$/);
    expect(computeContentHash("Stable", "content")).toBe(hash);
  });
});
