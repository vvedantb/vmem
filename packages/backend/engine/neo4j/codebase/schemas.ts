/**
 * Zod schemas for Neo4j codebase read queries.
 * Parse once at the driver boundary — consumers stay fully typed.
 */

import { z } from "zod";
import { neo4jIntSchema, parseNeo4jInt } from "../record";

/** Neo4j Integer | number | null → number | undefined. */
export const optionalNeo4jIntSchema = z
  .unknown()
  .nullable()
  .optional()
  .transform((v): number | undefined => {
    if (v == null) return undefined;
    return parseNeo4jInt(v);
  });

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
});

export const labelsSchema = z.array(z.string());

export const stringArraySchema = z.array(z.string());

export const edgeTierSchema = z.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]);

export const nullableEdgeTierSchema = edgeTierSchema.nullable();

export const nullableNumberSchema = z
  .union([z.number(), neo4jIntSchema, z.null()])
  .transform((v): number | null => (v === null ? null : v));

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

export const impactRecordSchema = z.object({
  id: z.string(),
  distance: neo4jIntSchema,
});
