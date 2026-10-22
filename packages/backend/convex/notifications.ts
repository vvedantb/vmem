import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./auth";
import { getUserIdByClerkId } from "./lib/clerkUser";
import { notificationFields, notificationTypeValidator } from "./validators";

// Handlers take the resolved user id: the web functions pass ctx.userId and
// the MCP *ByClerkIdInternal functions resolve it from the verified clerk id.

async function requireOwnedNotification(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"notifications">,
): Promise<Doc<"notifications">> {
  const notification = await ctx.db.get(id);
  if (!notification || notification.userId !== userId) {
    throw new Error("Notification not found");
  }
  return notification;
}

async function setNotificationRead(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"notifications">,
  read: boolean,
): Promise<null> {
  await requireOwnedNotification(ctx, userId, id);
  await ctx.db.patch(id, { read });
  return null;
}

async function listNotifications(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"notifications">[]> {
  return await ctx.db
    .query("notifications")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
}

async function listUnread(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"notifications">[]> {
  return await ctx.db
    .query("notifications")
    .withIndex("by_user_read", (q) => q.eq("userId", userId).eq("read", false))
    .collect();
}

async function markAllRead(ctx: MutationCtx, userId: Id<"users">) {
  for (const notification of await listUnread(ctx, userId)) {
    await ctx.db.patch(notification._id, { read: true });
  }
  return null;
}

async function deleteOwnedNotification(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"notifications">,
): Promise<null> {
  await requireOwnedNotification(ctx, userId, id);
  await ctx.db.delete(id);
  return null;
}

// MCP passes ids as plain strings: a malformed id is just "not found"
function requireNotificationId(ctx: QueryCtx, id: string): Id<"notifications"> {
  const normalized = ctx.db.normalizeId("notifications", id);
  if (normalized === null) throw new Error("Notification not found");
  return normalized;
}

export const listMy = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("notifications"),
      _creationTime: v.number(),
      ...notificationFields,
    }),
  ),
  handler: async (ctx) => listNotifications(ctx, ctx.userId),
});

export const unreadCount = authQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await listUnread(ctx, ctx.userId)).length,
});

export const markAsRead = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) =>
    setNotificationRead(ctx, ctx.userId, args.id, true),
});

export const markAsUnread = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) =>
    setNotificationRead(ctx, ctx.userId, args.id, false),
});

export const markAllAsRead = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => markAllRead(ctx, ctx.userId),
});

export const listByClerkIdInternal = internalQuery({
  args: { clerkId: v.string(), unreadOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const unread = await listUnread(ctx, userId);
    const rows = args.unreadOnly
      ? unread.sort((a, b) => b.createdAt - a.createdAt)
      : await listNotifications(ctx, userId);
    return {
      unreadCount: unread.length,
      notifications: rows.map((row) => ({
        id: row._id,
        title: row.title,
        description: row.description,
        type: row.type,
        read: row.read,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
    };
  },
});

export const markByClerkIdInternal = internalMutation({
  args: { clerkId: v.string(), id: v.string(), read: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    return setNotificationRead(
      ctx,
      userId,
      requireNotificationId(ctx, args.id),
      args.read,
    );
  },
});

export const markAllReadByClerkIdInternal = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) =>
    markAllRead(ctx, await getUserIdByClerkId(ctx, args.clerkId)),
});

export const deleteByClerkIdInternal = internalMutation({
  args: { clerkId: v.string(), id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    return deleteOwnedNotification(
      ctx,
      userId,
      requireNotificationId(ctx, args.id),
    );
  },
});

async function insertNotification(
  ctx: MutationCtx,
  userId: Id<"users">,
  title: string,
  description: string,
  type: Doc<"notifications">["type"],
): Promise<null> {
  await ctx.db.insert("notifications", {
    userId,
    title,
    description,
    type,
    read: false,
    createdAt: Date.now(),
  });
  return null;
}

// push a notification to a known user row
export const pushInternal = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    description: v.string(),
    type: notificationTypeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) =>
    insertNotification(
      ctx,
      args.userId,
      args.title,
      args.description,
      args.type,
    ),
});

// emit one notification per real producer shape so the inbox can be exercised without
export const sendTest = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const samples: Array<{
      title: string;
      description: string;
      type: Doc<"notifications">["type"];
    }> = [
      {
        title: "Connector sync stalled — Notion",
        description:
          "The sync was interrupted before finishing. Reconnect the connector and sync again.",
        type: "warning",
      },
      {
        title: "Connector sync failed — Google Drive",
        description: "Token expired — reconnect the connector.",
        type: "error",
      },
      {
        title: "Dream Mode finished",
        description:
          "3 proposals to review and 1 new memory. Open Dreaming to review.",
        type: "info",
      },
    ];
    for (const sample of samples) {
      await insertNotification(
        ctx,
        ctx.userId,
        sample.title,
        sample.description,
        sample.type,
      );
    }
    return null;
  },
});

export const deleteNotification = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) =>
    deleteOwnedNotification(ctx, ctx.userId, args.id),
});
