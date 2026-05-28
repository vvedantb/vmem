"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mcpScopeValidator, type McpScope } from "../profiles/mcpAccess";

interface ProfileResponse {
  id: string;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
  teamId: string | null;
}

function mapProfile(profile: Doc<"profiles">): ProfileResponse {
  return {
    id: profile._id,
    name: profile.name,
    color: profile.color,
    icon: profile.icon,
    isDefault: profile.isDefault,
    teamId: profile.teamId ?? null,
  };
}

/** List profiles visible in the current MCP connector scope. */
export const mcpListProfiles = internalAction({
  args: { clerkId: v.string(), scope: mcpScopeValidator },
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      color: v.string(),
      icon: v.string(),
      isDefault: v.boolean(),
      teamId: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args): Promise<ProfileResponse[]> => {
    const profiles = await ctx.runQuery(
      internal.profiles.listByClerkIdAndScopeInternal,
      { clerkId: args.clerkId, scope: args.scope },
    );
    return profiles.map(mapProfile);
  },
});

interface WhoamiResponse {
  authenticated: boolean;
  clerkUserId: string;
  scope: McpScope;
  activeProfile: {
    id: string;
    name: string;
    color: string;
    icon: string;
    teamId: string | null;
  } | null;
  profiles: Array<{
    id: string;
    name: string;
    isDefault: boolean;
    teamId: string | null;
  }>;
}

/** Returns auth info, connector scope, and scoped profile list. */
export const mcpWhoami = internalAction({
  args: { clerkId: v.string(), scope: mcpScopeValidator },
  returns: v.object({
    authenticated: v.boolean(),
    clerkUserId: v.string(),
    scope: mcpScopeValidator,
    activeProfile: v.union(
      v.object({
        id: v.string(),
        name: v.string(),
        color: v.string(),
        icon: v.string(),
        teamId: v.union(v.string(), v.null()),
      }),
      v.null(),
    ),
    profiles: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        isDefault: v.boolean(),
        teamId: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<WhoamiResponse> => {
    const clerkId = args.clerkId;
    const scope = args.scope;

    const profiles = await ctx.runQuery(
      internal.profiles.listByClerkIdAndScopeInternal,
      { clerkId, scope },
    );

    let activeProfile: Doc<"profiles"> | null = await ctx.runQuery(
      internal.profiles.getActiveProfileForMcpScopeInternal,
      { clerkId, scope },
    );

    if (!activeProfile && scope === "personal") {
      activeProfile = await ctx.runMutation(
        internal.profiles.getOrCreateDefaultByClerkIdInternal,
        { clerkId },
      );
    }

    return {
      authenticated: true,
      clerkUserId: clerkId,
      scope,
      activeProfile: activeProfile
        ? {
            id: activeProfile._id,
            name: activeProfile.name,
            color: activeProfile.color,
            icon: activeProfile.icon,
            teamId: activeProfile.teamId ?? null,
          }
        : null,
      profiles: profiles.map((profile: Doc<"profiles">) => ({
        id: profile._id,
        name: profile.name,
        isDefault: profile.isDefault,
        teamId: profile.teamId ?? null,
      })),
    };
  },
});

const activeProfileResult = v.object({
  id: v.string(),
  name: v.string(),
  color: v.string(),
  icon: v.string(),
  teamId: v.union(v.string(), v.null()),
});

export const mcpSetActiveProfile = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
    scope: mcpScopeValidator,
  },
  returns: activeProfileResult,
  handler: async (
    ctx,
    args,
  ): Promise<{
    id: string;
    name: string;
    color: string;
    icon: string;
    teamId: string | null;
  }> => {
    await ctx.runMutation(
      internal.userSettings.setMcpDefaultProfileByClerkIdInternal,
      {
        clerkId: args.clerkId,
        profileId: args.profileId,
        scope: args.scope,
      },
    );

    const activeProfile: Doc<"profiles"> | null = await ctx.runQuery(
      internal.profiles.getActiveProfileForMcpScopeInternal,
      { clerkId: args.clerkId, scope: args.scope },
    );
    if (!activeProfile) {
      throw new Error("Failed to resolve active profile");
    }

    return {
      id: activeProfile._id,
      name: activeProfile.name,
      color: activeProfile.color,
      icon: activeProfile.icon,
      teamId: activeProfile.teamId ?? null,
    };
  },
});
