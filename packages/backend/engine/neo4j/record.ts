import neo4j, { type Record as NeoRecord } from "neo4j-driver";
import { type ZodType, z } from "zod";

export function neo4jGet(record: NeoRecord, key: string): unknown {
  // oxlint-disable-next-line typescript/no-unsafe-assignment, typescript/no-unsafe-return -- neo4j Record.get is `any`
  return record.get(key);
}

export function neo4jString(record: NeoRecord, key: string): string {
  const value = neo4jGet(record, key);
  return typeof value === "string" ? value : "";
}

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

export function parseNeo4jInt(value: unknown): number {
  if (typeof value === "number") return value;
  if (neo4j.isInt(value)) return value.toNumber();
  throw new Error("Expected Neo4j integer or number");
}

export const neo4jIntSchema = z.unknown().transform(parseNeo4jInt);

export const stringSchema = z.string();

export function parseNeo4jNodeProps<T>(
  value: unknown,
  propsSchema: ZodType<T>,
): T {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected Neo4j node with properties");
  }
  const desc = Object.getOwnPropertyDescriptor(value, "properties");
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- PropertyDescriptor.value is `any`
  const properties: unknown = desc?.value;
  const parsed = propsSchema.safeParse(properties);
  if (!parsed.success) {
    throw new Error(
      `Neo4j node properties failed validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
