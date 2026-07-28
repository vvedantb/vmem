import { describe, expect, it } from "vitest";
import neo4j from "neo4j-driver";
import {
  neo4jIntSchema,
  nullableNumberSchema,
  parseNeo4jInt,
} from "../../engine/neo4j/record";

describe("neo4jIntSchema", () => {
  it("accepts JS numbers and Neo4j integers", () => {
    expect(neo4jIntSchema.parse(7)).toBe(7);
    expect(neo4jIntSchema.parse(neo4j.int(7))).toBe(7);
  });

  it("fails soft on null so unions can continue", () => {
    expect(neo4jIntSchema.safeParse(null).success).toBe(false);
  });
});

describe("nullableNumberSchema", () => {
  it("accepts null confidence from Cypher (RETURN null AS confidence)", () => {
    expect(nullableNumberSchema.parse(null)).toBe(null);
  });

  it("accepts floats and Neo4j integers", () => {
    expect(nullableNumberSchema.parse(0.85)).toBe(0.85);
    expect(nullableNumberSchema.parse(neo4j.int(1))).toBe(1);
  });

  it("does not throw through safeParse on bad values", () => {
    expect(() => nullableNumberSchema.safeParse("nope")).not.toThrow();
    expect(nullableNumberSchema.safeParse("nope").success).toBe(false);
  });
});

describe("parseNeo4jInt", () => {
  it("throws on null for direct call sites", () => {
    expect(() => parseNeo4jInt(null)).toThrow(
      "Expected Neo4j integer or number",
    );
  });
});
