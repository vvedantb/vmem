"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

interface ProfileResponse {
  id: string;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

/** List all profiles for the authenticated user */
export const mcpListProfiles = internalAction({
  args: { clerkId: v.string() },
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
    const profiles = await ctx.runQuery(
      internal.profiles.listByClerkIdInternal,
      { clerkId: args.clerkId },
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
  args: { clerkId: v.string() },
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
    const clerkId = args.clerkId;

    // Get profiles
    const profiles = await ctx.runQuery(
      internal.profiles.listByClerkIdInternal,
      { clerkId },
    );

    let activeProfile: Doc<"profiles"> | null = await ctx.runQuery(
      internal.profiles.getActiveProfileForMcpInternal,
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

const activeProfileResult = v.object({
  id: v.string(),
  name: v.string(),
  color: v.string(),
  icon: v.string(),
});

export const mcpSetActiveProfile = internalAction({
  args: { clerkId: v.string(), profileId: v.string() },
  returns: activeProfileResult,
  handler: async (
    ctx,
    args,
  ): Promise<{
    id: string;
    name: string;
    color: string;
    icon: string;
  }> => {
    await ctx.runMutation(
      internal.userSettings.setMcpDefaultProfileByClerkIdInternal,
      { clerkId: args.clerkId, profileId: args.profileId },
    );

    const activeProfile: Doc<"profiles"> | null = await ctx.runQuery(
      internal.profiles.getActiveProfileForMcpInternal,
      { clerkId: args.clerkId },
    );
    if (!activeProfile) {
      throw new Error("Failed to resolve active profile");
    }

    return {
      id: activeProfile._id,
      name: activeProfile.name,
      color: activeProfile.color,
      icon: activeProfile.icon,
    };
  },
});
