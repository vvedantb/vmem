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

async function setNotificationRead(
  ctx: MutationCtx & { userId: Id<"users"> },
  id: Id<"notifications">,
  read: boolean,
): Promise<null> {
  await requireOwnedNotification(ctx, id);
  await ctx.db.patch(id, { read });
  return null;
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
  handler: async (ctx, args) => setNotificationRead(ctx, args.id, true),
});

export const markAsUnread = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => setNotificationRead(ctx, args.id, false),
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
    return await insertNotification(
      ctx,
      user._id,
      args.title,
      args.description,
      args.type,
    );
  },
});

// emit one notification per real producer shape so the Inbox can be exercised without
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
        title: "Codebase sync failed — vedantb2/vmem",
        description: "Bad credentials — reconnect GitHub and sync again.",
        type: "error",
      },
      {
        title: "Codebase sync stalled — vedantb2/vmem",
        description:
          "The sync was interrupted before finishing. Open the codebase and click Sync to retry.",
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
          "3 proposals to review and 1 new memory. Open the Inbox to review.",
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
  handler: async (ctx, args) => {
    await requireOwnedNotification(ctx, args.id);
    await ctx.db.delete(args.id);
    return null;
  },
});
