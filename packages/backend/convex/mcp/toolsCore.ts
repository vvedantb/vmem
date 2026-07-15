import { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { emptyInputSchema, scopedClerk, toolSpec } from "./toolTypes";

type ActiveProfileResult = {
  id: string;
  name: string;
  color: string;
  icon: string;
  teamId: string | null;
};

type ProfileListItem = ActiveProfileResult & {
  isDefault: boolean;
};

type WhoamiProfileListItem = {
  id: string;
  name: string;
  isDefault: boolean;
  teamId: string | null;
};

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

const setActiveProfileSchema = z.object({
  profileId: z.string().describe("Profile ID from list_profiles"),
});

export const coreToolSpecs = {
  ping: toolSpec({
    name: "ping",
    schema: emptyInputSchema,
    description: "Health check tool for connector validation.",
    errorLabel: "Ping failed",
    async run(h): Promise<unknown> {
      return {
        ok: true,
        scope: h.scope,
        timestamp: new Date().toISOString(),
      };
    },
  }),
  whoami: toolSpec({
    name: "whoami",
    schema: emptyInputSchema,
    description: (scopeLabel) =>
      `Returns the authenticated user, active ${scopeLabel} profile, and profiles visible on this ${scopeLabel} MCP connector.`,
    errorLabel: "Whoami failed",
    async run(h): Promise<unknown> {
      const profiles = await h.ctx.runQuery(
        internal.profiles.listByClerkIdAndScopeInternal,
        scopedClerk(h),
      );

      let activeProfile: Doc<"profiles"> | null = await h.ctx.runQuery(
        internal.profiles.getActiveProfileForMcpScopeInternal,
        scopedClerk(h),
      );

      if (!activeProfile && h.scope === "personal") {
        activeProfile = await h.ctx.runMutation(
          internal.profiles.getOrCreateDefaultByClerkIdInternal,
          { clerkId: h.clerkUserId },
        );
      }

      return {
        authenticated: true,
        clerkUserId: h.clerkUserId,
        scope: h.scope,
        activeProfile: activeProfile ? mapActiveProfile(activeProfile) : null,
        profiles: profiles.map(mapWhoamiProfileListItem),
      };
    },
  }),
  list_profiles: toolSpec({
    name: "list_profiles",
    schema: emptyInputSchema,
    description: (scopeLabel) =>
      `List ${scopeLabel} profiles available on this MCP connector. Returns profile IDs, names, colors, and icons. Use set_active_profile to choose the default profile for memory tools, or pass profileId on memory_add / memory_search / memory_retrieve.`,
    errorLabel: "List profiles failed",
    async run(h): Promise<unknown> {
      const profiles = await h.ctx.runQuery(
        internal.profiles.listByClerkIdAndScopeInternal,
        scopedClerk(h),
      );
      return profiles.map(mapProfileListItem);
    },
  }),
  set_active_profile: toolSpec({
    name: "set_active_profile",
    schema: setActiveProfileSchema,
    description: (scopeLabel) =>
      `Set the default ${scopeLabel} profile for MCP memory tools (memory_add, memory_search, memory_retrieve when profileId is omitted). Call list_profiles first to get valid profile IDs.`,
    errorLabel: "Set active profile failed",
    async run(h, params): Promise<unknown> {
      await h.ctx.runMutation(
        internal.userSettings.setMcpDefaultProfileByClerkIdInternal,
        {
          ...scopedClerk(h),
          profileId: params.profileId,
        },
      );

      const activeProfile: Doc<"profiles"> | null = await h.ctx.runQuery(
        internal.profiles.getActiveProfileForMcpScopeInternal,
        scopedClerk(h),
      );
      if (!activeProfile) {
        throw new Error("Failed to resolve active profile");
      }

      return mapActiveProfile(activeProfile);
    },
  }),
  context_prompt_get: toolSpec({
    name: "context_prompt_get",
    schema: emptyInputSchema,
    description:
      "Returns the full vmem user profile markdown (same as MCP resource vmem://context_prompt): About, Preferences, pinned memories, profile summary, and Available Skills (name + description). Call at session start or when a skill might apply — claude.ai cannot re-read the resource mid-chat. Then call skills_get with the exact skill name to load the playbook.",
    errorLabel: "Context prompt get failed",
    scopes: ["personal"],
    async run(h): Promise<unknown> {
      if (h.scope === "team") {
        throw new Error(
          "context_prompt is only available on the personal vmem MCP connector",
        );
      }
      return h.ctx.runAction(internal.contextPromptApi.mcpGetContextPrompt, {
        clerkId: h.clerkUserId,
      });
    },
  }),
};
