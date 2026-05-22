import { z } from "zod";

export const storeBodySchema = z.object({
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

export const retrieveBodySchema = z.object({
  query: z.string(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().positive().default(10),
  profileId: z.string().optional(),
});

export const updateBodySchema = z.object({
  memoryId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().optional(),
  expiresAt: z.union([z.string(), z.null()]).optional(),
});

export type StoreBody = z.infer<typeof storeBodySchema>;
export type RetrieveBody = z.infer<typeof retrieveBodySchema>;
export type UpdateBody = z.infer<typeof updateBodySchema>;
