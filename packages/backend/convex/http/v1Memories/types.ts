import type { FunctionReturnType } from "convex/server";
import { z } from "zod";
import type { MemoryCandidate } from "../../../engine/neo4j/memory/types";
import { internal } from "../../_generated/api";
import type { OpenRouterRequired } from "../../neo4jActions/agent/shared";

export type RetrieveHttpResult = {
  memories: MemoryCandidate[];
  userContext: FunctionReturnType<
    typeof internal.userSettings.getUserContextInternal
  >;
  summary?: string;
};

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
