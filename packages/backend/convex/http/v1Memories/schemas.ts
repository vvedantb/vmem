import { z } from "zod";

const structuredStoreBodySchema = z.object({
  title: z.string(),
  content: z.string(),
  type: z.string(),
  source: z.string(),
  tags: z.array(z.string()),
  confidence: z.number(),
  expiresAt: z.string().optional(),
  url: z.string().optional(),
  profileId: z.string().optional(),
  externalId: z.string().optional(),
  sourceType: z.string().optional(),
});

const instructionStoreBodySchema = z.object({
  instruction: z.string().min(1),
  profileId: z.string().optional(),
});

export const storeBodySchema = z.union([
  structuredStoreBodySchema,
  instructionStoreBodySchema,
]);

const structuredUpdateBodySchema = z.object({
  memoryId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().optional(),
  expiresAt: z.union([z.string(), z.null()]).optional(),
});

const instructionUpdateBodySchema = z.object({
  instruction: z.string().min(1),
  profileId: z.string().optional(),
});

export const updateBodySchema = z.union([
  structuredUpdateBodySchema,
  instructionUpdateBodySchema,
]);

export const retrieveBodySchema = z.object({
  query: z.string(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
  profileId: z.string().optional(),
  summarize: z.boolean().optional(),
});

export const deleteBodySchema = z.object({
  memoryId: z.string(),
});

export type StoreBody = z.infer<typeof storeBodySchema>;
type InstructionStoreBody = z.infer<typeof instructionStoreBodySchema>;
export type UpdateBody = z.infer<typeof updateBodySchema>;
type InstructionUpdateBody = z.infer<typeof instructionUpdateBodySchema>;
export type RetrieveBody = z.infer<typeof retrieveBodySchema>;
export type DeleteBody = z.infer<typeof deleteBodySchema>;

export function isInstructionStoreBody(
  body: StoreBody,
): body is InstructionStoreBody {
  return "instruction" in body;
}

export function isInstructionUpdateBody(
  body: UpdateBody,
): body is InstructionUpdateBody {
  return "instruction" in body;
}
