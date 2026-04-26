import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { auditLog, ResourceTypes } from "./auditLog";

const eventTypeValidator = v.union(
  v.literal("memory_created"),
  v.literal("memory_updated"),
  v.literal("memory_deleted"),
  v.literal("relationship_created"),
  v.literal("relationship_deleted"),
  v.literal("dream_synthesis_proposed"),
  v.literal("dream_synthesis_materialized"),
);

export type MemoryEventType =
  | "memory_created"
  | "memory_updated"
  | "memory_deleted"
  | "relationship_created"
  | "relationship_deleted"
  /** Dream Mode created a synthesis proposal (kind ∈ insight/connection/contradiction/anomaly). */
  | "dream_synthesis_proposed"
  /** Dream Mode auto-materialized a synthesis as a real :Memory (auto-accept on). */
  | "dream_synthesis_materialized";

/**
 * Maps the short change-feed event type to a stable, dotted audit-log action.
 * Kept in sync with the audit log's memory resource conventions.
 */
export const ACTION_FOR_EVENT: Record<MemoryEventType, string> = {
  memory_created: "memory.created",
  memory_updated: "memory.updated",
  memory_deleted: "memory.deleted",
  relationship_created: "memory.relationship.created",
  relationship_deleted: "memory.relationship.deleted",
  dream_synthesis_proposed: "memory.dream.synthesis_proposed",
  dream_synthesis_materialized: "memory.dream.synthesis_materialized",
};

type MemoryEventArgs = {
  clerkId: string;
  eventType: MemoryEventType;
  memoryId: string;
  payload: string;
};

/**
 * Writes a single memory/relationship event to the permanent audit-log trail.
 * Shared between the public (secret-guarded) and internal memory-event mutations.
 */
async function recordMemoryEvent(
  ctx: MutationCtx,
  args: MemoryEventArgs,
): Promise<void> {
  await auditLog.log(ctx, {
    action: ACTION_FOR_EVENT[args.eventType],
    actorId: args.clerkId,
    resourceType: ResourceTypes.MEMORY,
    resourceId: args.memoryId,
    metadata: { payload: args.payload },
    severity: "info",
  });
}

export const pushEvent = mutation({
  args: {
    secret: v.string(),
    clerkId: v.string(),
    eventType: eventTypeValidator,
    memoryId: v.string(),
    payload: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const expected = process.env.CONVEX_EVENT_SECRET;
    if (!expected || args.secret !== expected) {
      throw new Error("Unauthorized");
    }

    await recordMemoryEvent(ctx, {
      clerkId: args.clerkId,
      eventType: args.eventType,
      memoryId: args.memoryId,
      payload: args.payload,
    });

    return null;
  },
});

export const pushEventInternal = internalMutation({
  args: {
    clerkId: v.string(),
    eventType: eventTypeValidator,
    memoryId: v.string(),
    payload: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordMemoryEvent(ctx, {
      clerkId: args.clerkId,
      eventType: args.eventType,
      memoryId: args.memoryId,
      payload: args.payload,
    });
    return null;
  },
});

/**
 * Live change-feed for the web graph view (`useMemoryEvents`). Returns the
 * raw audit-log entries for memory/relationship actions — the web hook owns
 * the reverse map (action → `MemoryEventType`) and reshaping.
 *
 * The audit-log client types entries as `any`; we narrow each field with
 * `typeof` checks before returning, and rely on the Convex runtime
 * `returns:` validator as a second gate.
 */
export const getRecentEvents = query({
  args: {
    since: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.string(),
      action: v.string(),
      resourceId: v.string(),
      payload: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const clerkId = identity.subject;
    if (!clerkId) return [];

    const entries = await auditLog.queryByActor(ctx, {
      actorId: clerkId,
      fromTimestamp: args.since,
      actions: Object.values(ACTION_FOR_EVENT),
      limit: 200,
    });

    const result: {
      _id: string;
      action: string;
      resourceId: string;
      payload: string;
    }[] = [];

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const entryId = typeof entry._id === "string" ? entry._id : null;
      if (!entryId) continue;
      const action = typeof entry.action === "string" ? entry.action : null;
      if (!action) continue;
      const resourceId =
        typeof entry.resourceId === "string" ? entry.resourceId : null;
      if (!resourceId) continue;

      const payload =
        typeof entry.metadata?.payload === "string"
          ? entry.metadata.payload
          : "{}";

      result.push({
        _id: entryId,
        action,
        resourceId,
        payload,
      });
    }

    return result;
  },
});
