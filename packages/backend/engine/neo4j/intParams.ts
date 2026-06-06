/**
 * Neo4j Cypher params for LIMIT, SKIP, hop depth, etc. must be integers.
 * MCP/JSON/Convex action hops often deliver floats (e.g. 25.0); passing
 * those raw makes Neo4j reject the query.
 */

import neo4j, { type Integer } from "neo4j-driver";

/** Truncate and wrap any numeric input for Neo4j integer params. */
export function toNeo4jIntParam(value: number): Integer {
  return neo4j.int(Math.trunc(value));
}

/** Clamp optional limit-like input, then return a Neo4j integer param. */
export function clampNeo4jLimit(
  value: number | undefined,
  fallback: number,
  max: number,
): Integer {
  const clamped = Math.max(1, Math.min(max, Math.trunc(value ?? fallback)));
  return neo4j.int(clamped);
}
