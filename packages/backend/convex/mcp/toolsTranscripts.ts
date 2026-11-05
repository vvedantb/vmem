import { z } from "zod";
import { submitTranscript } from "../transcripts";
import { resolveMcpSource } from "./clientInfo";
import { withMcpMemoryScope } from "./memoryScope";
import { mcpClientName, scopedMemory, toolSpec } from "./toolTypes";

const transcriptSubmitSchema = z.object({
  transcript: z
    .string()
    .describe(
      "The session transcript as plain text, Markdown, JSON or JSONL. At most 1.5 MB (UTF-8); a larger one is refused, so split it",
    ),
  title: z
    .string()
    .optional()
    .describe("Short name of the session, e.g. the task it worked on"),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID to file it under (defaults to active profile)"),
});

export const transcriptToolSpecs = {
  transcript_submit: toolSpec({
    name: "transcript_submit",
    schema: transcriptSubmitSchema,
    description:
      "Submit a session transcript for Dream Mode. Nothing is saved at once: the next nightly or manual Dream run reads it, picks out durable facts, preferences, decisions, commands that worked and lessons (secrets removed), and puts them in the Dreaming inbox as proposals (saved at once only when Dream Mode auto-accept is on and the AI is confident). The transcript text is deleted once it is read. source is recorded from the connected app. Returns id, status (pending), source, byteLength and createdAt.",
    errorLabel: "Submit transcript failed",
    async run(h, params) {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        async (scope) =>
          submitTranscript(h.ctx, {
            clerkId: scope.clerkId,
            profileId: scope.profileId,
            source: resolveMcpSource({
              clientName: await mcpClientName(h),
              agentSource: undefined,
            }),
            transcript: params.transcript,
            ...(params.title === undefined ? {} : { title: params.title }),
          }),
      );
    },
  }),
};
