/**
 * The single source of truth for the vmem memory wire contract.
 *
 * Everything that speaks memories over the wire — the HTTP `/v1/memories`
 * handlers, the MCP tools, the Neo4j engine mappers, the mcp-ui graph bundle
 * and this SDK — derives its shapes from here. Do not redeclare these schemas
 * or hand-roll the equivalent interfaces anywhere else.
 */
import { z } from "zod";

// ── Enums ────────────────────────────────────────────────────────────────────

export const memoryTypeSchema = z.enum(["profile", "episodic", "knowledge"]);
export const memoryStatusSchema = z.enum([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

// ── Memory shapes ────────────────────────────────────────────────────────────

export const memoryNodeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  profileId: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  type: memoryTypeSchema,
  source: z.string(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceSyncedAt: z.string().nullable(),
  confidence: z.number(),
  status: memoryStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullable(),
});

export const memoryWithTagsSchema = memoryNodeSchema.extend({
  tags: z.array(z.string()),
});

export const graphPathTraceSchema = z.object({
  seedTitle: z.string(),
  bridgingEntity: z.string().nullable(),
  hops: z.number(),
});

export const scoreBreakdownSchema = z.object({
  fulltext: z.number(),
  vector: z.number(),
  chunk: z.number(),
  entity: z.number(),
  rrf: z.number(),
  recency: z.number(),
  confidence: z.number(),
  graphPath: graphPathTraceSchema.optional(),
  rerankerScore: z.number().optional(),
});

export const matchedChunkSchema = z.object({
  content: z.string(),
  position: z.number(),
});

export const memoryCandidateSchema = memoryWithTagsSchema.extend({
  trace: z.object({
    score: z.number(),
    scoreBreakdown: scoreBreakdownSchema,
    reason: z.string(),
  }),
  matchedChunk: matchedChunkSchema.optional(),
});

export const userContextSchema = z.object({
  aboutMe: z.string().nullable(),
  preferences: z.string().nullable(),
});

export const agentProposalSchema = z.object({
  id: z.string(),
  memoryId: z.string(),
  proposedContent: z.string(),
  reason: z.string(),
  kind: z.string(),
  status: z.string(),
});

export type MemoryNode = z.infer<typeof memoryNodeSchema>;
export type MemoryWithTags = z.infer<typeof memoryWithTagsSchema>;
export type GraphPathTrace = z.infer<typeof graphPathTraceSchema>;
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;
export type MatchedChunk = z.infer<typeof matchedChunkSchema>;
export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;
export type UserContext = z.infer<typeof userContextSchema>;
export type AgentProposal = z.infer<typeof agentProposalSchema>;

// ── Request bodies ───────────────────────────────────────────────────────────

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

// ── Response bodies ──────────────────────────────────────────────────────────

export const storeInstructionResultSchema = z.object({
  created: z.array(memoryWithTagsSchema),
  summary: z.string(),
});

export const updateInstructionResultSchema = z.object({
  applied: z.array(memoryWithTagsSchema),
  proposals: z.array(agentProposalSchema),
  summary: z.string(),
});

export const retrieveResultSchema = z.object({
  memories: z.array(memoryCandidateSchema),
  userContext: userContextSchema,
  summary: z.string().optional(),
});

export const deleteMemoryResultSchema = z.object({
  deleted: z.literal(true),
});

export const healthResultSchema = z.object({
  status: z.literal("ok"),
});

export type StoreInstructionResult = z.infer<
  typeof storeInstructionResultSchema
>;
export type UpdateInstructionResult = z.infer<
  typeof updateInstructionResultSchema
>;
export type RetrieveResult = z.infer<typeof retrieveResultSchema>;
export type DeleteMemoryResult = z.infer<typeof deleteMemoryResultSchema>;
export type HealthResult = z.infer<typeof healthResultSchema>;
