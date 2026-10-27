import { z } from "zod";
import { internal } from "../_generated/api";
import { runManualDream } from "../dreaming";
import { resolveProposalWithAudit } from "../proposedUpdateApi";
import { withMcpMemoryScope } from "./memoryScope";
import {
  emptyInputSchema,
  requireUserId,
  scopedMemory,
  toolSpec,
} from "./toolTypes";

const profileIdParam = z
  .string()
  .optional()
  .describe("Profile ID (defaults to the active MCP profile)");

const proposalsListSchema = z.object({ profileId: profileIdParam });

const proposalsResolveSchema = z.object({
  proposalId: z.string().describe("Proposal id from proposals_list"),
  action: z
    .enum(["approve", "reject"])
    .describe("approve applies the proposal; reject dismisses it"),
  winnerMemoryId: z
    .string()
    .optional()
    .describe(
      "Contradiction proposals only: the source memory to keep (one of sourceMemoryIds). The others are superseded",
    ),
  selectedSourceMemoryIds: z
    .array(z.string())
    .optional()
    .describe(
      "Merge proposals only: the sourceMemoryIds to merge (default all). The kept memory (memoryId) always stays; at least one other must be listed. Unlisted memories stay as they are",
    ),
  profileId: profileIdParam,
});

const notificationsListSchema = z.object({
  unreadOnly: z
    .boolean()
    .optional()
    .describe("Only unread notifications (default false)"),
});

const notificationIdParam = z
  .string()
  .describe("Notification id from notifications_list");

const notificationsMarkSchema = z.object({
  id: notificationIdParam,
  read: z.boolean().describe("true marks read, false marks unread"),
});

const notificationsDeleteSchema = z.object({ id: notificationIdParam });

export const inboxToolSpecs = {
  proposals_list: toolSpec({
    name: "proposals_list",
    schema: proposalsListSchema,
    description:
      "List pending inbox proposals for a profile, newest first (the web Dreaming page Proposals tab): Dream Mode merges, skill drafts, and update, delete, insight, connection, contradiction and anomaly suggestions. Each has id, kind, reason, proposedTitle / proposedContent, sourceMemoryIds and snapshots. Resolve with proposals_resolve.",
    errorLabel: "List proposals failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        (scope) =>
          h.ctx.runQuery(internal.proposedUpdateApi.listPendingInternal, {
            userId: scope.clerkId,
            profileId: scope.profileId,
          }),
      );
    },
  }),
  proposals_resolve: toolSpec({
    name: "proposals_resolve",
    schema: proposalsResolveSchema,
    description:
      "Approve or reject one pending proposal from proposals_list, as on the web Dreaming page. Approving a Dream Mode merge keeps memoryId, gives it proposedTitle / proposedContent (the merged text) and hides the other sources (undo for 30 days); pass selectedSourceMemoryIds to merge only some of them. Approving an update or other merge writes a new memory and supersedes the sources; approving a delete supersedes the memory; for a contradiction pass winnerMemoryId to keep that memory; approving a skill creates that skill. Returns status and materializedMemoryId.",
    errorLabel: "Resolve proposal failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        async (scope) => {
          const pending = await h.ctx.runQuery(
            internal.proposedUpdateApi.listPendingInternal,
            { userId: scope.clerkId, profileId: scope.profileId },
          );
          const proposal = pending.find((row) => row.id === params.proposalId);
          if (!proposal) throw new Error("Proposal not found");
          if (
            params.winnerMemoryId !== undefined &&
            !proposal.sourceMemoryIds.includes(params.winnerMemoryId)
          ) {
            throw new Error("winnerMemoryId must be one of sourceMemoryIds");
          }
          const result = await resolveProposalWithAudit(h.ctx, {
            clerkId: scope.clerkId,
            actorUserId: await requireUserId(h),
            proposalId: proposal.id,
            action: params.action,
            winnerMemoryId: params.winnerMemoryId,
            selectedSourceMemoryIds: params.selectedSourceMemoryIds,
          });
          if (!result) throw new Error("Proposal not found");
          return result;
        },
      );
    },
  }),
  dream_run: toolSpec({
    name: "dream_run",
    schema: emptyInputSchema,
    description:
      "Run Dream Mode now, like the web Run dream mode button: the nightly pass over your personal profiles and the team profiles you own. Merges exact and same-page duplicates and host-name tag spellings (see memory_tags_consolidate), expires rows past expiresAt and archives stale browsing history (each change undoable for 30 days). Returns reason, runIds (one dreaming log row per profile) and counts. Rate limited to once an hour; returns reason rate-limited when it ran too recently.",
    errorLabel: "Dream run failed",
    scopes: ["personal"],
    async run(h): Promise<unknown> {
      return runManualDream(h.ctx, { userId: await requireUserId(h) });
    },
  }),
  dream_history: toolSpec({
    name: "dream_history",
    schema: emptyInputSchema,
    description:
      "Read-only dreaming log: your last 10 dream runs, newest first (the web Dreaming page). Each has runId, profileId, trigger (nightly, manual or backfill), dryRun, status, startedAt, finishedAt, counts (exactMerged, keyMerged, nearDupMerged, superseded, proposals, expired, archived, aiFlagged), aiCalls and costUsd. Counts only: no memory titles or content.",
    errorLabel: "Dream history failed",
    scopes: ["personal"],
    async run(h): Promise<unknown> {
      return h.ctx.runQuery(internal.dream.historyInternal, {
        userId: await requireUserId(h),
      });
    },
  }),
  notifications_list: toolSpec({
    name: "notifications_list",
    schema: notificationsListSchema,
    description:
      "List the user's inbox notifications, newest first, plus unreadCount (the web Inbox Notifications panel).",
    errorLabel: "List notifications failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return h.ctx.runQuery(internal.notifications.listByClerkIdInternal, {
        clerkId: h.clerkUserId,
        unreadOnly: params.unreadOnly,
      });
    },
  }),
  notifications_mark: toolSpec({
    name: "notifications_mark",
    schema: notificationsMarkSchema,
    description: "Mark one notification read or unread.",
    errorLabel: "Mark notification failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      await h.ctx.runMutation(internal.notifications.markByClerkIdInternal, {
        clerkId: h.clerkUserId,
        id: params.id,
        read: params.read,
      });
      return { id: params.id, read: params.read };
    },
  }),
  notifications_mark_all_read: toolSpec({
    name: "notifications_mark_all_read",
    schema: emptyInputSchema,
    description: "Mark every notification read.",
    errorLabel: "Mark all notifications failed",
    scopes: ["personal"],
    async run(h): Promise<unknown> {
      await h.ctx.runMutation(
        internal.notifications.markAllReadByClerkIdInternal,
        { clerkId: h.clerkUserId },
      );
      return { ok: true };
    },
  }),
  notifications_delete: toolSpec({
    name: "notifications_delete",
    schema: notificationsDeleteSchema,
    description: "Delete one notification permanently.",
    errorLabel: "Delete notification failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      await h.ctx.runMutation(internal.notifications.deleteByClerkIdInternal, {
        clerkId: h.clerkUserId,
        id: params.id,
      });
      return { deleted: true };
    },
  }),
};
