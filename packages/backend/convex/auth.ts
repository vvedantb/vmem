import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  customAction,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { createClerkUserAuth } from "@vvedantb/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { DEFAULT_PROFILE_COLOR } from "./profiles/helpers";
import { normalizeAccountEmail } from "./lib/accountEmail";

const userAuth = createClerkUserAuth<DataModel>()({
  table: "users",
  index: "by_clerk_id",
  field: "clerkId",
});

export async function getUserByClerkId(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
): Promise<Doc<"users"> | null> {
  return await userAuth.getUserByClerkId(ctx, clerkId);
}

// throws "Not authenticated" for no identity, an empty subject or no users row
export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  return await userAuth.requireCurrentUserId(ctx);
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

export const authQuery = authQueryBuilder;
export const authMutation = authMutationBuilder;
export const authAction = authActionBuilder;

export type AuthActionCtx = ActionCtx & { userId: Id<"users"> };

export async function requireClerkId(ctx: AuthActionCtx): Promise<string> {
  const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
    userId: ctx.userId,
  });
  if (!clerkId) throw new Error("User not found");
  return clerkId;
}

// auto create default "personal" profile for new users
async function insertPersonalProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("profiles", {
    userId,
    name: "Personal",
    color: DEFAULT_PROFILE_COLOR,
    icon: "user",
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function insertUserWithPersonalProfile(
  ctx: MutationCtx,
  fields: {
    clerkId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
  },
): Promise<Id<"users">> {
  const userId = await ctx.db.insert("users", fields);
  await insertPersonalProfile(ctx, userId);
  return userId;
}

export const ensureUserExists = mutation({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    wasCreated: v.boolean(),
  }),
  handler: async (ctx) => {
    const result = await userAuth.ensureUser(
      ctx,
      (identity) => ({
        clerkId: identity.subject,
        email: normalizeAccountEmail(identity.email),
        firstName:
          typeof identity.givenName === "string"
            ? identity.givenName
            : undefined,
        lastName:
          typeof identity.familyName === "string"
            ? identity.familyName
            : undefined,
        fullName: typeof identity.name === "string" ? identity.name : undefined,
      }),
      {
        patch: (existing, identity) => {
          const email = normalizeAccountEmail(identity.email);
          return email !== undefined && existing.email !== email
            ? { email }
            : undefined;
        },
      },
    );
    if (result.wasCreated) {
      await insertPersonalProfile(ctx, result.userId);
    }
    return result;
  },
});

// HTTP routes have no Convex identity: they resolve the user from a verified Clerk id.
export const getUserIdByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    return user?._id ?? null;
  },
});

export const ensureUserForClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
  },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, args) => {
    const existing = await getUserByClerkId(ctx, args.clerkId);
    if (existing) {
      return { userId: existing._id };
    }
    const userId = await insertUserWithPersonalProfile(ctx, {
      ...args,
      email: normalizeAccountEmail(args.email),
    });
    return { userId };
  },
});

export const me = query({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    return await getCurrentUserId(ctx);
  },
});

export const getClerkIdInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.clerkId ?? null;
  },
});
