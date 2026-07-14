import neo4j from "neo4j-driver";
import { z } from "zod";
import { neo4jIntSchema, parseNeo4jInt } from "../record";

export const optionalNeo4jIntSchema = z
  .custom<number | undefined>((v) => {
    if (v === undefined || v === null) return true;
    return typeof v === "number" || neo4j.isInt(v);
  })
  .transform((v): number | undefined => {
    if (v == null) return undefined;
    return parseNeo4jInt(v);
  });

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

export type OverviewNodeProps = z.infer<typeof overviewNodePropsSchema>;

export const labelsSchema = z.array(z.string());

export const stringArraySchema = z.array(z.string());

export const nullableEdgeTierSchema = z
  .enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"])
  .nullable();

// null before neo4jIntSchema: z.unknown() accepts null, and a throwing
// transform would abort the union before z.null() could match (blank graph)
export const nullableNumberSchema = z.union([
  z.null(),
  z.number(),
  neo4jIntSchema,
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
