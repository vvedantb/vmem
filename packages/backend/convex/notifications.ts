import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { authMutation, authQuery, getUserByClerkId } from "./auth";
import { notificationFields, notificationTypeValidator } from "./validators";

async function requireOwnedNotification(
  ctx: MutationCtx & { userId: Id<"users"> },
  id: Id<"notifications">,
): Promise<Doc<"notifications">> {
  const notification = await ctx.db.get(id);
  if (!notification || notification.userId !== ctx.userId) {
    throw new Error("Notification not found");
  }
  return notification;
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
  handler: async (ctx) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .collect();
  },
});

export const unreadCount = authQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", ctx.userId).eq("read", false),
      )
      .collect();
    return unread.length;
  },
});

export const markAsRead = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedNotification(ctx, args.id);
    await ctx.db.patch(args.id, { read: true });
    return null;
  },
});

export const markAsUnread = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedNotification(ctx, args.id);
    await ctx.db.patch(args.id, { read: false });
    return null;
  },
});

export const markAllAsRead = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", ctx.userId).eq("read", false),
      )
      .collect();
    for (const notification of unread) {
      await ctx.db.patch(notification._id, { read: true });
    }
    return null;
  },
});

/**
 * Internal helper used by background actions (e.g. V2 fact-extraction
 * pipeline) to surface a notification on the user's bell. clerkId is
 * resolved to the Convex `users._id` here; callers in `"use node"`
 * actions don't need to do that themselves. Silently no-ops if no user
 * record exists for the clerkId — keeps best-effort callers simple.
 */
export const pushForClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    title: v.string(),
    description: v.string(),
    type: notificationTypeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user) return null;

    await ctx.db.insert("notifications", {
      userId: user._id,
      title: args.title,
      description: args.description,
      type: args.type,
      read: false,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const deleteNotification = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedNotification(ctx, args.id);
    await ctx.db.delete(args.id);
    return null;
  },
});
