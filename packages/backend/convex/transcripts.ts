import { v, type Infer } from "convex/values";
import {
  addDreamCounts,
  aiCallStop,
  DREAM_AI_APPLY_MIN,
  spendAiCall,
  type DreamAiAllowance,
} from "../engine/memory/dream/nightly";
import {
  buildTranscriptDistillPrompt,
  chunkTranscript,
  parseTranscriptDistillReply,
  TRANSCRIPT_DISTILL_ROLE,
  transcriptByteLength,
  transcriptSizeError,
  type TranscriptCandidate,
} from "../engine/memory/dream/transcriptDistill";
import { computeContentHash } from "../engine/memory/hash";
import { buildSearchableText } from "../engine/memory/searchableText";
import { isVisibleStatus } from "../engine/memory/scope";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { dreamSpentTodayUsd } from "./dream";
import { callJsonChatWithUsage } from "./lib/openRouter/jsonChat";
import { userFacingError } from "./lib/userFacingError";
import { createMemory } from "./memoryStore/helpers";
import { insertProposedUpdate } from "./proposedUpdateStore";
import { dreamSettingsOf, getSettingsDoc } from "./userSettings";
import { memoryTypeValidator } from "./validators";

// Session transcripts: one write path (submitTranscript, used by the MCP
// transcript_submit tool and POST /api/v1/transcripts) stores the text in
// file storage and a pending sessionTranscripts row. The nightly (or manual)
// Dream run distills each pending transcript with one AI call per prompt
// part, sends the candidates down the Dream proposal path (inbox proposals;
// saved at once only with dreamModeAutoAccept and confidence >= 0.9, as for
// AI merges), then deletes the text. Saved memories are embedded, so the
// write-time candidates and the Jev judge dedupe them like any other memory.

// memories from a transcript carry this source, and the app as a tag
export const TRANSCRIPT_SOURCE = "transcript";
const TITLE_MAX = 200;
// failed distills are retried on later nights up to this many attempts
export const TRANSCRIPT_MAX_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
export const TRANSCRIPT_RETENTION_MS = 30 * DAY_MS;
const PURGE_BATCH = 200;
const ERROR_CHARS = 300;

const receiptValidator = v.object({
  id: v.id("sessionTranscripts"),
  status: v.literal("pending"),
  source: v.string(),
  byteLength: v.number(),
  createdAt: v.string(),
});
type TranscriptReceipt = Infer<typeof receiptValidator>;

export const insertInternal = internalMutation({
  args: {
    userId: v.string(),
    profileId: v.string(),
    source: v.string(),
    title: v.optional(v.string()),
    storageId: v.id("_storage"),
    byteLength: v.number(),
  },
  returns: receiptValidator,
  handler: async (ctx, args): Promise<TranscriptReceipt> => {
    const createdAt = Date.now();
    const id = await ctx.db.insert("sessionTranscripts", {
      ...args,
      status: "pending",
      attempts: 0,
      createdAt,
    });
    return {
      id,
      status: "pending",
      source: args.source,
      byteLength: args.byteLength,
      createdAt: new Date(createdAt).toISOString(),
    };
  },
});

/**
 * Stores one transcript for the next Dream run. The caller has resolved and
 * checked the profile. Refuses an empty transcript or one over 1.5 MB.
 */
export async function submitTranscript(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    profileId: string;
    source: string;
    transcript: string;
    title?: string;
  },
): Promise<TranscriptReceipt> {
  const sizeError = transcriptSizeError(args.transcript);
  if (sizeError !== null) userFacingError(sizeError);
  const title = args.title?.trim().slice(0, TITLE_MAX);
  const storageId = await ctx.storage.store(
    new Blob([args.transcript], { type: "text/plain;charset=utf-8" }),
  );
  return await ctx.runMutation(internal.transcripts.insertInternal, {
    userId: args.clerkId,
    profileId: args.profileId,
    source: args.source,
    ...(title ? { title } : {}),
    storageId,
    byteLength: transcriptByteLength(args.transcript),
  });
}

// ------------------------------------------------------------ save / propose

function transcriptTags(source: string): string[] {
  return source === TRANSCRIPT_SOURCE
    ? [TRANSCRIPT_SOURCE]
    : [TRANSCRIPT_SOURCE, source];
}

/**
 * Saves one transcript memory (source "transcript", tagged with the app)
 * and schedules its embedding, so the write-time Dream candidates and the
 * nightly Jev judge see it. `memoryId` is the id an approved proposal
 * promised. Returns the memory id (an exact repeat returns the existing one).
 */
export async function saveTranscriptMemory(
  ctx: MutationCtx,
  args: {
    clerkId: string;
    profileId?: string;
    memoryId?: string;
    title: string;
    content: string;
    type: TranscriptCandidate["type"];
    confidence: number;
    appSource: string;
  },
): Promise<string> {
  const created = await createMemory(ctx, {
    ...(args.memoryId === undefined ? {} : { memoryId: args.memoryId }),
    userId: args.clerkId,
    ...(args.profileId === undefined ? {} : { profileId: args.profileId }),
    title: args.title,
    content: args.content,
    type: args.type,
    source: TRANSCRIPT_SOURCE,
    tags: transcriptTags(args.appSource),
    confidence: args.confidence,
  });
  await ctx.scheduler.runAfter(0, internal.memoryEmbed.embedMemoryInternal, {
    clerkId: args.clerkId,
    memoryId: created.id,
    ...(created.profileId === null ? {} : { profileId: created.profileId }),
    text: buildSearchableText(created.title, created.content, created.tags),
  });
  return created.id;
}

// a visible memory of the profile with this exact text (the deterministic
// dedupe of Dream step 1): no proposal needed
async function exactRepeat(
  ctx: MutationCtx,
  transcript: Doc<"sessionTranscripts">,
  candidate: TranscriptCandidate,
): Promise<boolean> {
  const contentHash = computeContentHash(candidate.title, candidate.content);
  const rows = await ctx.db
    .query("memories")
    .withIndex("by_user_profile_hash", (q) =>
      q
        .eq("userId", transcript.userId)
        .eq("profileId", transcript.profileId)
        .eq("contentHash", contentHash),
    )
    .take(5);
  return rows.some((row) => isVisibleStatus(row.status));
}

function proposalReason(transcript: Doc<"sessionTranscripts">): string {
  const named = transcript.title === undefined ? "" : ` "${transcript.title}"`;
  return `From the ${transcript.source} session transcript${named}. Approve to save it as a new memory.`;
}

// ------------------------------------------------------------ nightly step

// new transcripts first, then retries
const PICKUP_ORDER: readonly Doc<"sessionTranscripts">["status"][] = [
  "pending",
  "failed",
];

const pendingRowValidator = v.object({
  _id: v.id("sessionTranscripts"),
  storageId: v.id("_storage"),
  title: v.union(v.string(), v.null()),
  source: v.string(),
  createdAt: v.number(),
});

/**
 * Up to `limit` transcripts of the profile to distill, oldest first: pending
 * ones, then failed ones with attempts left. Plus today's dream spend.
 */
export const toDistillInternal = internalQuery({
  args: { profileId: v.string(), limit: v.number() },
  returns: v.object({
    spentTodayUsd: v.number(),
    transcripts: v.array(pendingRowValidator),
  }),
  handler: async (ctx, args) => {
    const rows: Doc<"sessionTranscripts">[] = [];
    for (const status of PICKUP_ORDER) {
      const left = args.limit - rows.length;
      if (left <= 0) break;
      const page = await ctx.db
        .query("sessionTranscripts")
        .withIndex("by_profile_status_created", (q) =>
          q.eq("profileId", args.profileId).eq("status", status),
        )
        .filter((q) => q.lt(q.field("attempts"), TRANSCRIPT_MAX_ATTEMPTS))
        .take(left);
      rows.push(...page);
    }
    const transcripts = rows.flatMap((row) =>
      row.storageId === undefined
        ? []
        : [
            {
              _id: row._id,
              storageId: row.storageId,
              title: row.title ?? null,
              source: row.source,
              createdAt: row.createdAt,
            },
          ],
    );
    return {
      spentTodayUsd:
        transcripts.length === 0 ? 0 : await dreamSpentTodayUsd(ctx),
      transcripts,
    };
  },
});

const candidateValidator = v.object({
  title: v.string(),
  content: v.string(),
  type: memoryTypeValidator,
  confidence: v.number(),
});

async function addRunUsage(
  ctx: MutationCtx,
  runId: Id<"dreamRuns">,
  usage: { aiCalls: number; costUsd: number },
  counts: { proposals?: number; transcriptSaved?: number } = {},
): Promise<void> {
  const run = await ctx.db.get(runId);
  if (!run) return;
  await ctx.db.patch(run._id, {
    counts: addDreamCounts(run.counts, counts),
    aiCalls: run.aiCalls + usage.aiCalls,
    costUsd: run.costUsd + usage.costUsd,
  });
}

/**
 * Sends the distilled candidates down the Dream proposal path: saved at
 * once with auto-accept and confidence >= 0.9 (as AI merges), else one
 * inbox proposal each. An exact repeat of a visible memory is skipped. Then
 * the transcript is processed and its text deleted.
 */
export const recordDistilledInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    transcriptId: v.id("sessionTranscripts"),
    candidates: v.array(candidateValidator),
    aiCalls: v.number(),
    costUsd: v.number(),
  },
  returns: v.object({ proposals: v.number(), saved: v.number() }),
  handler: async (ctx, args) => {
    const usage = { aiCalls: args.aiCalls, costUsd: args.costUsd };
    const transcript = await ctx.db.get(args.transcriptId);
    const run = await ctx.db.get(args.runId);
    if (!transcript || !run || transcript.status === "processed") {
      await addRunUsage(ctx, args.runId, usage);
      return { proposals: 0, saved: 0 };
    }
    const { autoAccept } = dreamSettingsOf(
      await getSettingsDoc(ctx, run.userId),
    );
    let proposals = 0;
    let saved = 0;
    for (const candidate of args.candidates) {
      if (await exactRepeat(ctx, transcript, candidate)) continue;
      if (autoAccept && candidate.confidence >= DREAM_AI_APPLY_MIN) {
        await saveTranscriptMemory(ctx, {
          clerkId: transcript.userId,
          profileId: transcript.profileId,
          ...candidate,
          appSource: transcript.source,
        });
        saved += 1;
        continue;
      }
      await insertProposedUpdate(ctx, {
        userId: transcript.userId,
        profileId: transcript.profileId,
        // the id the memory gets when the proposal is approved
        memoryId: crypto.randomUUID(),
        proposedTitle: candidate.title,
        proposedContent: candidate.content,
        reason: proposalReason(transcript),
        kind: "transcript",
        sourceMemoryIds: [],
        confidence: candidate.confidence,
        source: "dream-mode",
        sourceMemorySnapshots: [],
        dreamRunId: run._id,
        transcript: { source: transcript.source, type: candidate.type },
      });
      proposals += 1;
    }
    if (transcript.storageId !== undefined) {
      await ctx.storage.delete(transcript.storageId);
    }
    const now = Date.now();
    await ctx.db.patch(transcript._id, {
      status: "processed",
      storageId: undefined,
      error: undefined,
      attempts: transcript.attempts + 1,
      processedAt: now,
    });
    await addRunUsage(ctx, run._id, usage, {
      proposals,
      ...(saved > 0 ? { transcriptSaved: saved } : {}),
    });
    return { proposals, saved };
  },
});

/**
 * A failed distill: the transcript is retried on a later night until
 * TRANSCRIPT_MAX_ATTEMPTS; after the last attempt its text is deleted.
 */
export const recordFailedInternal = internalMutation({
  args: {
    runId: v.id("dreamRuns"),
    transcriptId: v.id("sessionTranscripts"),
    error: v.string(),
    aiCalls: v.number(),
    costUsd: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await addRunUsage(ctx, args.runId, args);
    const transcript = await ctx.db.get(args.transcriptId);
    if (!transcript || transcript.status === "processed") return null;
    const attempts = transcript.attempts + 1;
    const lastTry = attempts >= TRANSCRIPT_MAX_ATTEMPTS;
    if (lastTry && transcript.storageId !== undefined) {
      await ctx.storage.delete(transcript.storageId);
    }
    await ctx.db.patch(transcript._id, {
      status: "failed",
      attempts,
      error: args.error.slice(0, ERROR_CHARS),
      failedAt: Date.now(),
      ...(lastTry ? { storageId: undefined } : {}),
    });
    return null;
  },
});

/**
 * The transcript step of one profile's Dream run: each pending (or failed,
 * attempts left) transcript gets one call per prompt part, within the
 * transcript cap, the user's nightly total and the daily budget. A
 * transcript that does not fit in the calls left waits for the next night.
 * True when transcripts were left over.
 */
export async function runTranscriptStep(
  ctx: ActionCtx,
  args: {
    runId: Id<"dreamRuns">;
    userId: Id<"users">;
    profileId: Id<"profiles">;
    ai: { apiKey: string; allowance: DreamAiAllowance };
  },
): Promise<boolean> {
  const { ai } = args;
  if (aiCallStop(ai.allowance, "transcript", 0) !== null) return false;
  const batch = await ctx.runQuery(internal.transcripts.toDistillInternal, {
    profileId: args.profileId,
    limit: ai.allowance.byKind.transcript,
  });
  let spent = batch.spentTodayUsd;
  for (const transcript of batch.transcripts) {
    const blob = await ctx.storage.get(transcript.storageId);
    if (blob === null) {
      await ctx.runMutation(internal.transcripts.recordFailedInternal, {
        runId: args.runId,
        transcriptId: transcript._id,
        error: "transcript text is gone",
        aiCalls: 0,
        costUsd: 0,
      });
      continue;
    }
    const parts = chunkTranscript(await blob.text());
    const callsLeft = Math.min(
      ai.allowance.byKind.transcript,
      ai.allowance.total,
    );
    if (
      parts.length > callsLeft ||
      aiCallStop(ai.allowance, "transcript", spent) !== null
    ) {
      return true;
    }
    const candidates: TranscriptCandidate[] = [];
    let aiCalls = 0;
    let costUsd = 0;
    let failure: string | null = null;
    for (const [index, text] of parts.entries()) {
      ai.allowance = spendAiCall(ai.allowance, "transcript");
      aiCalls += 1;
      try {
        const reply = await callJsonChatWithUsage(ctx, {
          apiKey: ai.apiKey,
          userId: args.userId,
          profileId: args.profileId,
          feature: "dream",
          role: TRANSCRIPT_DISTILL_ROLE,
          prompt: buildTranscriptDistillPrompt({
            text,
            title: transcript.title,
            source: transcript.source,
            submittedAt: transcript.createdAt,
            ...(parts.length > 1
              ? { part: { index: index + 1, total: parts.length } }
              : {}),
          }),
          thinking: "off",
        });
        costUsd += reply.costUsd ?? 0;
        // the chat helper logs a failed call and gives no content
        const parsed = parseTranscriptDistillReply(reply.content);
        if (parsed === null) {
          failure =
            reply.content === null ? "the AI call failed" : "malformed reply";
          break;
        }
        candidates.push(...parsed);
      } catch (error) {
        failure = error instanceof Error ? error.message : "distill failed";
        break;
      }
    }
    spent += costUsd;
    if (failure === null) {
      await ctx.runMutation(internal.transcripts.recordDistilledInternal, {
        runId: args.runId,
        transcriptId: transcript._id,
        candidates,
        aiCalls,
        costUsd,
      });
    } else {
      await ctx.runMutation(internal.transcripts.recordFailedInternal, {
        runId: args.runId,
        transcriptId: transcript._id,
        error: failure,
        aiCalls,
        costUsd,
      });
    }
  }
  return false;
}

// ------------------------------------------------------------ retention

/**
 * Hourly: drops transcript rows older than 30 days, whatever their status,
 * with any text still stored. 200 rows a batch, then the next batch.
 */
export const purgeExpiredInternal = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - TRANSCRIPT_RETENTION_MS;
    const rows = await ctx.db
      .query("sessionTranscripts")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
      .take(PURGE_BATCH);
    for (const row of rows) {
      if (row.storageId !== undefined) await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
    if (rows.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.transcripts.purgeExpiredInternal,
        {},
      );
    }
    return rows.length;
  },
});
