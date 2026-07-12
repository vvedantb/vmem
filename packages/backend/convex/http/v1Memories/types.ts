import { z } from "zod";
import type {
  MemoryCandidate,
  MemoryWithTags,
} from "../../../engine/neo4j/memory/types";
import type { OpenRouterRequired } from "../../neo4jActions/agent/shared";
import type { StoreFromInstructionResult } from "../../neo4jActions/agent/storeFromInstruction";
import type { SummarizeRetrieveResult } from "../../neo4jActions/agent/summarizeRetrieve";
import type { UpdateFromInstructionResult } from "../../neo4jActions/agent/updateFromInstruction";

export type RetrieveMemoriesActionResult = MemoryCandidate[];

export type StoreFromInstructionActionResult =
  | StoreFromInstructionResult
  | OpenRouterRequired;

export type UpdateFromInstructionActionResult =
  | UpdateFromInstructionResult
  | OpenRouterRequired;

export type SummarizeRetrieveActionResult =
  | SummarizeRetrieveResult
  | OpenRouterRequired;

export type UpdateMemoryActionResult = MemoryWithTags | null;

export type CreateMemoryActionResult = MemoryWithTags;

export interface UserContextResult {
  aboutMe: string | null;
  preferences: string | null;
}

export interface RetrieveHttpResult {
  memories: RetrieveMemoriesActionResult;
  userContext: UserContextResult;
  summary?: string;
}

const openRouterRequiredSchema = z.object({
  error: z.literal("openrouter_required"),
});

export function isOpenRouterRequired(
  value: unknown,
): value is OpenRouterRequired {
  return openRouterRequiredSchema.safeParse(value).success;
}

export function openRouterRequiredResponse(): Response {
  return Response.json({ error: "openrouter_required" }, { status: 422 });
}
