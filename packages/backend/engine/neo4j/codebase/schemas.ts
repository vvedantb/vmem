/**
 * Zod schemas for Neo4j codebase read queries.
 * Parse once at the driver boundary — consumers stay fully typed.
 */

import neo4j from "neo4j-driver";
import { z } from "zod";
import { neo4jIntSchema, parseNeo4jInt } from "../record";

/** Neo4j Integer | number | null → number | undefined. */
export const optionalNeo4jIntSchema = z
  .custom<number | undefined>((v) => {
    if (v === undefined || v === null) return true;
    return typeof v === "number" || neo4j.isInt(v);
  })
  .transform((v): number | undefined => {
    if (v == null) return undefined;
    return parseNeo4jInt(v);
  });

/** Parsed Neo4j node `.properties` for overview / search reads. */
export type OverviewNodeProps = {
  id: string;
  name?: string;
  qualifiedName?: string;
  path?: string;
  filePath?: string;
  filename?: string;
  directory?: string;
  isExported?: boolean;
  isAsync?: boolean;
  isTest?: boolean;
  startLine?: number;
  endLine?: number;
};

/** Node `.properties` shape shared across overview / search reads. */
export const overviewNodePropsSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  qualifiedName: z.string().optional(),
  path: z.string().optional(),
  filePath: z.string().optional(),
  filename: z.string().optional(),
  directory: z.string().optional(),
  isExported: z.boolean().optional(),
  isAsync: z.boolean().optional(),
  isTest: z.boolean().optional(),
  startLine: optionalNeo4jIntSchema,
  endLine: optionalNeo4jIntSchema,
}) satisfies z.ZodType<OverviewNodeProps, z.ZodTypeDef, unknown>;

export const labelsSchema = z.array(z.string());

export const stringArraySchema = z.array(z.string());

export const edgeTierSchema = z.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]);

export const nullableEdgeTierSchema = edgeTierSchema.nullable();

export const nullableNumberSchema = z.union([
  z.number(),
  neo4jIntSchema,
  z.null(),
]);

export const symbolRefSchema = z.object({
  id: z.string().nullable(),
  name: z.string().optional(),
  filePath: z.string().optional(),
});

export const symbolRefListSchema = z.array(symbolRefSchema);

export const processRefSchema = z.object({
  id: z.string().nullable(),
  name: z.string().optional(),
});

export const processRefListSchema = z.array(processRefSchema);
