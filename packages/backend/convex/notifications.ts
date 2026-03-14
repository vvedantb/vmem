import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";

export const listMy = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("notifications"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.string(),
      description: v.string(),
      type: v.union(
        v.literal("success"),
        v.literal("warning"),
        v.literal("error"),
        v.literal("info"),
      ),
      read: v.boolean(),
      createdAt: v.number(),
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
    const notification = await ctx.db.get(args.id);
    if (!notification || notification.userId !== ctx.userId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(args.id, { read: true });
    return null;
  },
});

export const markAsUnread = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification || notification.userId !== ctx.userId) {
      throw new Error("Notification not found");
    }
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

export const deleteNotification = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification || notification.userId !== ctx.userId) {
      throw new Error("Notification not found");
    }
    await ctx.db.delete(args.id);
    return null;
  },
});
