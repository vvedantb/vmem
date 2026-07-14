import type { Doc } from "../_generated/dataModel";

export type ActiveProfileResult = {
  id: string;
  name: string;
  color: string;
  icon: string;
  teamId: string | null;
};

export type ProfileListItem = ActiveProfileResult & {
  isDefault: boolean;
};

export type WhoamiProfileListItem = {
  id: string;
  name: string;
  isDefault: boolean;
  teamId: string | null;
};

export function mapActiveProfile(
  profile: Doc<"profiles">,
): ActiveProfileResult {
  return {
    id: profile._id,
    name: profile.name,
    color: profile.color,
    icon: profile.icon,
    teamId: profile.teamId ?? null,
  };
}

export function mapProfileListItem(profile: Doc<"profiles">): ProfileListItem {
  return {
    ...mapActiveProfile(profile),
    isDefault: profile.isDefault,
  };
}

export function mapWhoamiProfileListItem(
  profile: Doc<"profiles">,
): WhoamiProfileListItem {
  return {
    id: profile._id,
    name: profile.name,
    isDefault: profile.isDefault,
    teamId: profile.teamId ?? null,
  };
}
