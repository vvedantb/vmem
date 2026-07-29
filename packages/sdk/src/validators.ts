import type { z } from "zod";
import {
  deleteMemoryResultSchema,
  healthResultSchema,
  memoryWithTagsSchema,
  retrieveResultSchema,
  storeInstructionResultSchema,
  updateInstructionResultSchema,
  type DeleteMemoryResult,
  type HealthResult,
  type MemoryWithTags,
  type RetrieveResult,
  type StoreInstructionResult,
  type UpdateInstructionResult,
} from "./contract";
import { VMemoryError } from "./errors";

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

export function parseDeleteMemoryResult(value: unknown): DeleteMemoryResult {
  return parseOrThrow(deleteMemoryResultSchema, value);
}

export function parseHealthResult(value: unknown): HealthResult {
  return parseOrThrow(healthResultSchema, value);
}
