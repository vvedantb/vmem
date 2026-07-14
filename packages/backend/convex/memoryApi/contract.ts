import { z } from "zod";

export const memoryTypeSchema = z.enum(["profile", "episodic", "knowledge"]);
export const memoryStatusSchema = z.enum([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

export const structuredStoreBodySchema = z.object({
  title: z.string(),
  content: z.string(),
  type: memoryTypeSchema,
  source: z.string(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  expiresAt: z.string().optional(),
  url: z.string().optional(),
  profileId: z.string().optional(),
  externalId: z.string().optional(),
  sourceType: z.string().optional(),
});

export const instructionStoreBodySchema = z.object({
  instruction: z.string().min(1),
  profileId: z.string().optional(),
});

export const storeBodySchema = z.union([
  structuredStoreBodySchema,
  instructionStoreBodySchema,
]);

export const retrieveBodySchema = z.object({
  query: z.string(),
  type: memoryTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  profileId: z.string().optional(),
  summarize: z.boolean().optional(),
});

export const structuredUpdateBodySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: memoryTypeSchema.optional(),
  status: memoryStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  expiresAt: z.union([z.string(), z.null()]).optional(),
});

export const instructionUpdateBodySchema = z.object({
  instruction: z.string().min(1),
  profileId: z.string().optional(),
});

export const updateBodySchema = z.union([
  structuredUpdateBodySchema,
  instructionUpdateBodySchema,
]);

export const deleteBodySchema = z.object({
  id: z.string(),
});

export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
export type StructuredStoreBody = z.infer<typeof structuredStoreBodySchema>;
export type InstructionStoreBody = z.infer<typeof instructionStoreBodySchema>;
export type StoreBody = z.infer<typeof storeBodySchema>;
export type RetrieveBody = z.infer<typeof retrieveBodySchema>;
export type StructuredUpdateBody = z.infer<typeof structuredUpdateBodySchema>;
export type InstructionUpdateBody = z.infer<typeof instructionUpdateBodySchema>;
export type UpdateBody = z.infer<typeof updateBodySchema>;
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
