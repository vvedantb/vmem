import { z } from "zod";
import { VMemoryError } from "./errors";
import type {
  MemoryWithTags,
  RetrieveResult,
  StoreInstructionResult,
  UpdateInstructionResult,
} from "./types";

const memoryWithTagsSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  content: z.string(),
  type: z.string(),
  source: z.string(),
  confidence: z.number(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullable(),
  tags: z.array(z.string()),
});

const scoreBreakdownSchema = z.object({
  fulltext: z.number(),
  vector: z.number(),
  chunk: z.number(),
  entity: z.number(),
  rrf: z.number(),
  recency: z.number(),
  confidence: z.number(),
  graphPath: z
    .object({
      seedTitle: z.string(),
      bridgingEntity: z.string().nullable(),
      hops: z.number(),
    })
    .optional(),
  rerankerScore: z.number().optional(),
});

const memoryCandidateSchema = memoryWithTagsSchema.extend({
  trace: z.object({
    score: z.number(),
    scoreBreakdown: scoreBreakdownSchema,
    reason: z.string(),
  }),
  matchedChunk: z
    .object({
      content: z.string(),
      position: z.number(),
    })
    .optional(),
});

const agentProposalSchema = z.object({
  id: z.string(),
  memoryId: z.string(),
  proposedContent: z.string(),
  reason: z.string(),
  kind: z.string(),
  status: z.string(),
});

const storeInstructionResultSchema = z.object({
  created: z.array(memoryWithTagsSchema),
  summary: z.string(),
});

const updateInstructionResultSchema = z.object({
  applied: z.array(memoryWithTagsSchema),
  proposals: z.array(agentProposalSchema),
  summary: z.string(),
});

const retrieveResultSchema = z.object({
  memories: z.array(memoryCandidateSchema),
  userContext: z.object({
    aboutMe: z.string().nullable(),
    preferences: z.string().nullable(),
  }),
  summary: z.string().optional(),
});

function invalidResponse(): never {
  throw new VMemoryError(
    "VMemory API returned an unexpected response shape",
    0,
    "invalid_response",
  );
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    invalidResponse();
  }
  return parsed.data;
}

export function parseStoreInstructionResult(
  value: unknown,
): StoreInstructionResult {
  return parseOrThrow(storeInstructionResultSchema, value);
}

export function parseUpdateInstructionResult(
  value: unknown,
): UpdateInstructionResult {
  return parseOrThrow(updateInstructionResultSchema, value);
}

export function parseRetrieveResult(value: unknown): RetrieveResult {
  return parseOrThrow(retrieveResultSchema, value);
}

export function parseMemoryWithTagsResponse(value: unknown): MemoryWithTags {
  return parseOrThrow(memoryWithTagsSchema, value);
}
