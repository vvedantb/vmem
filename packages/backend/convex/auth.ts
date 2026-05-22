import {
  action,
  internalAction,
  internalQuery,
  mutation,
  query,
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import {
  customAction,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const clerkUserId = identity.subject;
  if (!clerkUserId) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
    .first();
  if (!user) throw new Error("Not authenticated");

  return user._id;
}

async function requireCurrentUserIdFromAction(
  ctx: ActionCtx,
): Promise<Id<"users">> {
  const userId = await ctx.runQuery(api.auth.me, {});
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

const authQueryBuilder = customQuery(query, {
  args: {},
  input: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    return {
      ctx: { ...ctx, userId },
      args,
    };
  },
});

const authMutationBuilder = customMutation(mutation, {
  args: {},
  input: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    return {
      ctx: { ...ctx, userId },
      args,
    };
  },
});

const authActionBuilder = customAction(action, {
  args: {},
  input: async (ctx, args) => {
    const userId = await requireCurrentUserIdFromAction(ctx);
    return {
      ctx: { ...ctx, userId },
      args,
    };
  },
});

const authInternalActionBuilder = customAction(internalAction, {
  args: {},
  input: async (ctx, args) => {
    const userId = await requireCurrentUserIdFromAction(ctx);
    return {
      ctx: { ...ctx, userId },
      args,
    };
  },
});

export const authQuery = authQueryBuilder;
export const authMutation = authMutationBuilder;
export const authAction = authActionBuilder;
export const authInternalAction = authInternalActionBuilder;

export type AuthActionCtx = ActionCtx & { userId: Id<"users"> };

/** Returns the Clerk subject ID for an authenticated action context. */
export async function requireClerkId(ctx: AuthActionCtx): Promise<string> {
  const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
    userId: ctx.userId,
  });
  if (!clerkId) throw new Error("User not found");
  return clerkId;
}

export const ensureUserExists = mutation({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    wasCreated: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkUserId = identity.subject;
    if (!clerkUserId) {
      throw new Error("Clerk user ID is required");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
      .first();

    if (existingUser) {
      return { userId: existingUser._id, wasCreated: false };
    }

    const email = identity.email || undefined;
    const firstName =
      typeof identity.givenName === "string" ? identity.givenName : undefined;
    const lastName =
      typeof identity.familyName === "string" ? identity.familyName : undefined;
    const fullName =
      typeof identity.name === "string" ? identity.name : undefined;

    const userId = await ctx.db.insert("users", {
      clerkId: clerkUserId,
      email,
      firstName,
      lastName,
      fullName,
    });

    // Auto-create default "Personal" profile for new users
    const now = Date.now();
    await ctx.db.insert("profiles", {
      userId,
      name: "Personal",
      color: "#3B82F6",
      icon: "user",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    return { userId, wasCreated: true };
  },
});

export const me = query({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    return await getCurrentUserId(ctx);
  },
});

/** Returns the Clerk subject ID for a given Convex user. */
export const getClerkIdInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.clerkId ?? null;
  },
});
