import neo4j, { type Integer } from "neo4j-driver";

export function clampNeo4jLimit(
  value: number | undefined,
  fallback: number,
  max: number,
): Integer {
  const clamped = Math.max(1, Math.min(max, Math.trunc(value ?? fallback)));
  return neo4j.int(clamped);
}
