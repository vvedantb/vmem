"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyMcpJwt } from "../src/neo4j/mcpAuth";
import type { Doc } from "./_generated/dataModel";

function verifyTokenOrThrow(token: string): string {
  const clerkId = verifyMcpJwt(token);
  if (!clerkId) throw new Error("Invalid or expired token");
  return clerkId;
}

interface ProfileResponse {
  id: string;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

/** List all profiles for the authenticated user */
export const mcpListProfiles = internalAction({
  args: { token: v.string() },
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      color: v.string(),
      icon: v.string(),
      isDefault: v.boolean(),
    }),
  ),
  handler: async (ctx, args): Promise<ProfileResponse[]> => {
    const clerkId = verifyTokenOrThrow(args.token);
    const profiles = await ctx.runQuery(
      internal.profiles.listByClerkIdInternal,
      { clerkId },
    );
    return profiles.map((p: Doc<"profiles">) => ({
      id: p._id,
      name: p.name,
      color: p.color,
      icon: p.icon,
      isDefault: p.isDefault,
    }));
  },
});

/** Get the active profile for the authenticated user */
export const mcpGetActiveProfile = internalAction({
  args: { token: v.string() },
  returns: v.object({
    id: v.string(),
    name: v.string(),
    color: v.string(),
    icon: v.string(),
    isDefault: v.boolean(),
  }),
  handler: async (ctx, args): Promise<ProfileResponse> => {
    const clerkId = verifyTokenOrThrow(args.token);
    const profile = await ctx.runQuery(
      internal.profiles.getActiveByClerkIdInternal,
      { clerkId },
    );
    if (!profile) {
      // Create default profile if none exists
      const defaultProfile = await ctx.runMutation(
        internal.profiles.getOrCreateDefaultByClerkIdInternal,
        { clerkId },
      );
      return {
        id: defaultProfile._id,
        name: defaultProfile.name,
        color: defaultProfile.color,
        icon: defaultProfile.icon,
        isDefault: defaultProfile.isDefault,
      };
    }
    return {
      id: profile._id,
      name: profile.name,
      color: profile.color,
      icon: profile.icon,
      isDefault: profile.isDefault,
    };
  },
});

interface WhoamiResponse {
  authenticated: boolean;
  clerkUserId: string;
  activeProfile: {
    id: string;
    name: string;
    color: string;
    icon: string;
  } | null;
  profiles: Array<{
    id: string;
    name: string;
    isDefault: boolean;
  }>;
}

/** Enhanced whoami that includes profile info */
export const mcpWhoami = internalAction({
  args: { token: v.string() },
  returns: v.object({
    authenticated: v.boolean(),
    clerkUserId: v.string(),
    activeProfile: v.union(
      v.object({
        id: v.string(),
        name: v.string(),
        color: v.string(),
        icon: v.string(),
      }),
      v.null(),
    ),
    profiles: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        isDefault: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<WhoamiResponse> => {
    const clerkId = verifyTokenOrThrow(args.token);

    // Get profiles
    const profiles = await ctx.runQuery(
      internal.profiles.listByClerkIdInternal,
      { clerkId },
    );

    // Get active profile (or create default)
    let activeProfile: Doc<"profiles"> | null = await ctx.runQuery(
      internal.profiles.getActiveByClerkIdInternal,
      { clerkId },
    );

    if (!activeProfile) {
      activeProfile = await ctx.runMutation(
        internal.profiles.getOrCreateDefaultByClerkIdInternal,
        { clerkId },
      );
    }

    return {
      authenticated: true,
      clerkUserId: clerkId,
      activeProfile: activeProfile
        ? {
            id: activeProfile._id,
            name: activeProfile.name,
            color: activeProfile.color,
            icon: activeProfile.icon,
          }
        : null,
      profiles: profiles.map((p: Doc<"profiles">) => ({
        id: p._id,
        name: p.name,
        isDefault: p.isDefault,
      })),
    };
  },
});
