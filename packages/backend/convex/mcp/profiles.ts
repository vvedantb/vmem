"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mcpScopeValidator } from "../profiles/mcpAccess";

const profileCoreFields = {
  id: v.string(),
  name: v.string(),
  color: v.string(),
  icon: v.string(),
  teamId: v.union(v.string(), v.null()),
};

const profileListItemValidator = v.object({
  ...profileCoreFields,
  isDefault: v.boolean(),
});

type ProfileListItem = Infer<typeof profileListItemValidator>;

const activeProfileResult = v.object(profileCoreFields);

type ActiveProfileResult = Infer<typeof activeProfileResult>;

const whoamiProfileListItemValidator = v.object({
  id: v.string(),
  name: v.string(),
  isDefault: v.boolean(),
  teamId: v.union(v.string(), v.null()),
});

type WhoamiProfileListItem = Infer<typeof whoamiProfileListItemValidator>;

const whoamiResultValidator = v.object({
  authenticated: v.boolean(),
  clerkUserId: v.string(),
  scope: mcpScopeValidator,
  activeProfile: v.union(activeProfileResult, v.null()),
  profiles: v.array(whoamiProfileListItemValidator),
});

type WhoamiResult = Infer<typeof whoamiResultValidator>;

function mapActiveProfile(profile: Doc<"profiles">): ActiveProfileResult {
  return {
    id: profile._id,
    name: profile.name,
    color: profile.color,
    icon: profile.icon,
    teamId: profile.teamId ?? null,
  };
}

function mapProfileListItem(profile: Doc<"profiles">): ProfileListItem {
  return {
    ...mapActiveProfile(profile),
    isDefault: profile.isDefault,
  };
}

function mapWhoamiProfileListItem(
  profile: Doc<"profiles">,
): WhoamiProfileListItem {
  return {
    id: profile._id,
    name: profile.name,
    isDefault: profile.isDefault,
    teamId: profile.teamId ?? null,
  };
}

/** List profiles visible in the current MCP connector scope. */
export const mcpListProfiles = internalAction({
  args: { clerkId: v.string(), scope: mcpScopeValidator },
  returns: v.array(profileListItemValidator),
  handler: async (ctx, args): Promise<ProfileListItem[]> => {
    const profiles = await ctx.runQuery(
      internal.profiles.listByClerkIdAndScopeInternal,
      { clerkId: args.clerkId, scope: args.scope },
    );
    return profiles.map(mapProfileListItem);
  },
});

/** Returns auth info, connector scope, and scoped profile list. */
export const mcpWhoami = internalAction({
  args: { clerkId: v.string(), scope: mcpScopeValidator },
  returns: whoamiResultValidator,
  handler: async (ctx, args): Promise<WhoamiResult> => {
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
      activeProfile: activeProfile ? mapActiveProfile(activeProfile) : null,
      profiles: profiles.map(mapWhoamiProfileListItem),
    };
  },
});

export const mcpSetActiveProfile = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
    scope: mcpScopeValidator,
  },
  returns: activeProfileResult,
  handler: async (ctx, args): Promise<ActiveProfileResult> => {
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

    return mapActiveProfile(activeProfile);
  },
});
