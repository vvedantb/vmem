import neo4j from "neo4j-driver";
import { describe, expect, it } from "vitest";
import { clampNeo4jLimit } from "../../engine/neo4j/intParams";

describe("clampNeo4jLimit", () => {
  it("uses fallback when value is undefined", () => {
    expect(clampNeo4jLimit(undefined, 25, 100).toNumber()).toBe(25);
  });

  it("clamps to [1, max] after truncating floats", () => {
    expect(clampNeo4jLimit(50.7, 25, 100).toNumber()).toBe(50);
    expect(clampNeo4jLimit(200, 25, 100).toNumber()).toBe(100);
    expect(clampNeo4jLimit(0.9, 25, 100).toNumber()).toBe(1);
  });

  it("returns a Neo4j integer suitable for LIMIT $limit", () => {
    const limit = clampNeo4jLimit(20.0, 25, 50);

    expect(neo4j.isInt(limit)).toBe(true);
    expect(limit.toNumber()).toBe(20);
  });
});
