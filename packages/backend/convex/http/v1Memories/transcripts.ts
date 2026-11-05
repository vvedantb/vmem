import { z } from "zod";
import type { ActionCtx } from "../../_generated/server";
import { transcriptSizeError } from "../../../engine/memory/dream/transcriptDistill";
import { resolveProfileIdForClerkId } from "../../memoryScope";
import { submitTranscript } from "../../transcripts";
import {
  guardProfileAccess,
  withApiKeyAuth,
  type ApiKeyAuth,
} from "./apiKeyAuth";

// POST /api/v1/transcripts: the HTTP twin of the MCP transcript_submit tool
// (same store path, source "api")
const API_SOURCE = "api";

const transcriptBodySchema = z.object({
  transcript: z.string(),
  title: z.string().optional(),
  profileId: z.string().optional(),
});

async function runSubmitHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: z.infer<typeof transcriptBodySchema>,
) {
  const sizeError = transcriptSizeError(body.transcript);
  if (sizeError !== null) {
    return Response.json(
      { error: "invalid_transcript", message: sizeError },
      { status: body.transcript.trim().length === 0 ? 400 : 413 },
    );
  }
  const forbidden = await guardProfileAccess(ctx, auth, body.profileId);
  if (forbidden) return forbidden;
  return await submitTranscript(ctx, {
    clerkId: auth.clerkId,
    profileId: await resolveProfileIdForClerkId(
      ctx,
      auth.clerkId,
      body.profileId,
    ),
    source: API_SOURCE,
    transcript: body.transcript,
    ...(body.title === undefined ? {} : { title: body.title }),
  });
}

export const submitTranscriptHttp = withApiKeyAuth(
  "/api/v1/transcripts",
  "POST",
  transcriptBodySchema,
  runSubmitHandler,
);
