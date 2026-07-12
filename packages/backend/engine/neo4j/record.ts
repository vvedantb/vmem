/**
 * Typed Neo4j record field access.
 *
 * `Record.get` is typed `any` by neo4j-driver. Cross that boundary once here,
 * then parse with zod so every consumer is fully typed.
 */

import neo4j, { type Record as NeoRecord } from "neo4j-driver";
import { type ZodType, z } from "zod";

/**
 * Read a raw Neo4j field as `unknown`.
 * Single intentional escape hatch for neo4j-driver's `any`-typed `get`.
 */
export function neo4jGet(record: NeoRecord, key: string): unknown {
  // oxlint-disable-next-line typescript/no-unsafe-assignment, typescript/no-unsafe-return -- neo4j Record.get is `any`
  return record.get(key);
}

/** Parse a Neo4j field with a zod schema. Throws on mismatch. */
export function neo4jField<T>(
  record: NeoRecord,
  key: string,
  schema: ZodType<T, z.ZodTypeDef, unknown>,
): T {
  const parsed = schema.safeParse(neo4jGet(record, key));
  if (!parsed.success) {
    throw new Error(
      `Neo4j field "${key}" failed validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** Neo4j Integer | number → number. */
export function parseNeo4jInt(value: unknown): number {
  if (typeof value === "number") return value;
  if (neo4j.isInt(value)) return value.toNumber();
  throw new Error("Expected Neo4j integer or number");
}

export const neo4jIntSchema = z.unknown().transform(parseNeo4jInt);

/**
 * Read `PropertyDescriptor.value` as `unknown`.
 * Descriptors are typed `any` in lib.es5 — one escape hatch.
 */
function descriptorValue(desc: PropertyDescriptor | undefined): unknown {
  if (!desc) return undefined;
  // oxlint-disable-next-line typescript/no-unsafe-assignment, typescript/no-unsafe-return -- PropertyDescriptor.value is `any`
  return desc.value;
}

/** Extract + validate `.properties` from a Neo4j Node (or node-shaped object). */
export function parseNeo4jNodeProps<T>(
  value: unknown,
  propsSchema: ZodType<T>,
): T {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected Neo4j node with properties");
  }
  const properties = descriptorValue(
    Object.getOwnPropertyDescriptor(value, "properties"),
  );
  const parsed = propsSchema.safeParse(properties);
  if (!parsed.success) {
    throw new Error(
      `Neo4j node properties failed validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
