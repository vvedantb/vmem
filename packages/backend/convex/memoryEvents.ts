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
);

export type MemoryEventType =
  | "memory_created"
  | "memory_updated"
  | "memory_deleted"
  | "relationship_created"
  | "relationship_deleted";

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
};

/**
 * Reverse mapping so `getRecentEvents` can translate audit-log actions back
 * into the compact `eventType` the web `useMemoryEvents` hook expects.
 */
const EVENT_FOR_ACTION: Record<string, MemoryEventType> = {
  "memory.created": "memory_created",
  "memory.updated": "memory_updated",
  "memory.deleted": "memory_deleted",
  "memory.relationship.created": "relationship_created",
  "memory.relationship.deleted": "relationship_deleted",
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
 * Live change-feed for the web graph view (`useMemoryEvents`). Reads from the
 * audit-log component and reshapes each entry back into the legacy
 * `memoryEvents` row shape the hook consumes.
 *
 * The audit-log client returns entries typed as `any` — we rely on the Convex
 * runtime validator (`returns:` below) to enforce the output shape.
 */
export const getRecentEvents = query({
  args: {
    since: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.string(),
      eventType: eventTypeValidator,
      memoryId: v.string(),
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
      eventType: MemoryEventType;
      memoryId: string;
      payload: string;
    }[] = [];

    for (const entry of entries) {
      const eventType = EVENT_FOR_ACTION[entry.action];
      if (!eventType) continue;
      if (typeof entry.resourceId !== "string") continue;

      const payload =
        typeof entry.metadata?.payload === "string"
          ? entry.metadata.payload
          : "{}";

      result.push({
        _id: entry._id,
        eventType,
        memoryId: entry.resourceId,
        payload,
      });
    }

    return result;
  },
});
