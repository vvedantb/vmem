import neo4j from "neo4j-driver";
import { describe, expect, it } from "vitest";
import { clampNeo4jLimit, toNeo4jIntParam } from "../../engine/neo4j/intParams";

describe("toNeo4jIntParam", () => {
  it("wraps float inputs as Neo4j integers (regression: MCP sends 25.0)", () => {
    const limit = toNeo4jIntParam(25.0);

    expect(neo4j.isInt(limit)).toBe(true);
    expect(limit.toNumber()).toBe(25);
  });

  it("truncates toward zero before wrapping", () => {
    expect(toNeo4jIntParam(3.9).toNumber()).toBe(3);
    expect(toNeo4jIntParam(-2.9).toNumber()).toBe(-2);
  });
});

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
