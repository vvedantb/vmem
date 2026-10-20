import { z } from "zod";
import {
  PROFILE_COLORS,
  PROFILE_ICON_NAMES,
  type ProfileIconName,
} from "@vmem/shared";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { runRemoveWithMemories } from "../profiles/lifecycle";
import { mapProfileListItem } from "./toolsCore";
import {
  authActionCtx,
  confirmParam,
  scopedClerk,
  toolSpec,
} from "./toolTypes";

// the web profile dialog choices (8 colours, 12 icons)
const colorParam = z
  .enum(PROFILE_COLORS)
  .describe(`Profile colour, one of ${PROFILE_COLORS.join(", ")}`);
const iconParam = z
  .enum(PROFILE_ICON_NAMES)
  .describe(`Profile icon, one of ${PROFILE_ICON_NAMES.join(", ")}`);
const nameParam = z.string().trim().min(1).describe("Profile name");

const DEFAULT_ICON: ProfileIconName = "user";

const profilesCreateSchema = z.object({
  name: nameParam,
  color: colorParam.optional().describe(`Defaults to ${PROFILE_COLORS[0]}`),
  icon: iconParam.optional().describe(`Defaults to ${DEFAULT_ICON}`),
});

const profilesUpdateSchema = z.object({
  profileId: z.string().describe("Profile ID from list_profiles"),
  name: nameParam.optional(),
  color: colorParam.optional(),
  icon: iconParam.optional(),
});

const profilesDeleteSchema = z.object({
  profileId: z.string().describe("Personal profile ID from list_profiles"),
  moveMemoriesToProfileId: z
    .string()
    .optional()
    .describe(
      "Another personal profile to move this profile's memories to. Omit to delete the memories with the profile",
    ),
  confirm: confirmParam.describe(
    "Must be true: the profile, and its memories unless moved, are deleted permanently",
  ),
});

function requireProfile(profile: Doc<"profiles"> | null) {
  if (profile === null) throw new Error("Profile not found");
  return mapProfileListItem(profile);
}

export const profilesToolSpecs = {
  profiles_create: toolSpec({
    name: "profiles_create",
    schema: profilesCreateSchema,
    description:
      "Create a personal profile (workspace) to group memories, as in the web Create Profile dialog. Names are unique per user.",
    errorLabel: "Create profile failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      const profile = await h.ctx.runMutation(
        internal.profiles.createByClerkIdInternal,
        {
          clerkId: h.clerkUserId,
          name: params.name,
          color: params.color ?? PROFILE_COLORS[0],
          icon: params.icon ?? DEFAULT_ICON,
        },
      );
      return requireProfile(profile);
    },
  }),
  profiles_update: toolSpec({
    name: "profiles_update",
    schema: profilesUpdateSchema,
    description: (scopeLabel) =>
      `Rename a ${scopeLabel} profile or change its colour or icon. Team profiles need the team owner role; renaming one renames the team.`,
    errorLabel: "Update profile failed",
    async run(h, params): Promise<unknown> {
      const profile = await h.ctx.runMutation(
        internal.profiles.updateByClerkIdInternal,
        { ...scopedClerk(h), ...params },
      );
      return requireProfile(profile);
    },
  }),
  profiles_delete: toolSpec({
    name: "profiles_delete",
    schema: profilesDeleteSchema,
    description:
      "Delete a personal profile, as in the web profile danger zone. Its memories move to moveMemoriesToProfileId, or are deleted when it is omitted. The default profile cannot be deleted; team profiles go with teams_delete. Requires confirm: true.",
    errorLabel: "Delete profile failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      const profile = await h.ctx.runQuery(
        internal.profiles.requireForMcpScopeInternal,
        { ...scopedClerk(h), profileId: params.profileId },
      );
      const target =
        params.moveMemoriesToProfileId === undefined
          ? undefined
          : await h.ctx.runQuery(internal.profiles.requireForMcpScopeInternal, {
              ...scopedClerk(h),
              profileId: params.moveMemoriesToProfileId,
            });
      // the ownership-checked web path: every check runs before memories move
      return runRemoveWithMemories(await authActionCtx(h), {
        profileId: profile._id,
        moveMemoriesToProfileId: target?._id,
      });
    },
  }),
};
