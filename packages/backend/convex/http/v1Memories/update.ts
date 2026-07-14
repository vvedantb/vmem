import { z } from "zod";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { OpenRouterRequired } from "../../neo4jActions/agent/shared";
import type { UpdateFromInstructionResult } from "../../neo4jActions/agent/updateFromInstruction";
import {
  guardProfileAccess,
  withApiKeyAuth,
  type ApiKeyAuth,
} from "./apiKeyAuth";
import { isOpenRouterRequired, openRouterRequiredResponse } from "./types";

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

const updateBodySchema = z.union([
  structuredUpdateBodySchema,
  instructionUpdateBodySchema,
]);

type UpdateBody = z.infer<typeof updateBodySchema>;
type InstructionUpdateBody = z.infer<typeof instructionUpdateBodySchema>;

function isInstructionUpdateBody(
  body: UpdateBody,
): body is InstructionUpdateBody {
  return "instruction" in body;
}

async function runUpdateHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: UpdateBody,
): Promise<
  | Response
  | MemoryWithTags
  | null
  | UpdateFromInstructionResult
  | OpenRouterRequired
> {
  if (isInstructionUpdateBody(body)) {
    const forbidden = await guardProfileAccess(ctx, auth, body.profileId);
    if (forbidden) {
      return forbidden;
    }

    const result = await ctx.runAction(
      internal.neo4jActions.agent.updateFromInstructionInternal,
      {
        clerkId: auth.clerkId,
        instruction: body.instruction,
        profileId: body.profileId,
      },
    );

    if (isOpenRouterRequired(result)) {
      return openRouterRequiredResponse();
    }

    return result;
  }

  const updated = await ctx.runAction(
    internal.neo4jActions.memories.updateMemoryInternal,
    {
      clerkId: auth.clerkId,
      memoryId: body.memoryId,
      title: body.title,
      content: body.content,
      type: body.type,
      status: body.status,
      tags: body.tags,
      confidence: body.confidence,
      expiresAt: body.expiresAt,
    },
  );

  if (updated === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return updated;
}

export const updateMemory = withApiKeyAuth(
  "/api/v1/memories",
  "PATCH",
  updateBodySchema,
  runUpdateHandler,
);
