"use client";

import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import {
  cn,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@vmem/ui";
import {
  IconUser,
  IconBriefcase,
  IconHome,
  IconCode,
  IconBook,
  IconHeart,
  IconStar,
  IconRocket,
  IconBulb,
  IconMusic,
  IconCamera,
  IconDeviceGamepad,
  IconUsers,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";

const ICON_MAP: Record<string, typeof IconUser> = {
  user: IconUser,
  briefcase: IconBriefcase,
  home: IconHome,
  code: IconCode,
  book: IconBook,
  heart: IconHeart,
  star: IconStar,
  rocket: IconRocket,
  lightbulb: IconBulb,
  music: IconMusic,
  camera: IconCamera,
  gamepad: IconDeviceGamepad,
};

function getProfileIcon(iconName: string) {
  return ICON_MAP[iconName] ?? IconUser;
}

type ProfileListItem = FunctionReturnType<typeof api.profiles.list>[number];

interface ProfileDropdownProps {
  value: string | undefined;
  onChange: (profileId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ProfileDropdown({
  value,
  onChange,
  disabled,
  className,
}: ProfileDropdownProps) {
  const { isAuthenticated } = useConvexAuth();
  const profiles = useQuery(api.profiles.list, isAuthenticated ? {} : "skip");
  const defaultProfileId = useQuery(
    api.userSettings.getDefaultProfile,
    isAuthenticated ? { source: "web" } : "skip",
  );

  const isLoading = profiles === undefined;

  // Set initial value from web default profile
  const effectiveValue =
    value ??
    (defaultProfileId ? String(defaultProfileId) : undefined) ??
    profiles?.find((p) => p.isDefault)?._id;

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return <Skeleton className={cn("h-10 w-40 rounded-lg", className)} />;
  }

  const selectedProfile = profiles?.find((p) => p._id === effectiveValue);

  // Partition into personal vs team so the dropdown can render two labelled groups.
  const personalProfiles: ProfileListItem[] = [];
  const teamProfiles: ProfileListItem[] = [];
  for (const p of profiles ?? []) {
    if (p.teamId) teamProfiles.push(p);
    else personalProfiles.push(p);
  }

  return (
    <Select
      value={effectiveValue}
      onValueChange={onChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger
        className={cn(
          "h-10 w-auto min-w-[140px] bg-surface-secondary/50 border-border hover:bg-surface-tertiary",
          className,
        )}
      >
        <SelectValue placeholder="Select profile">
          {selectedProfile && (
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selectedProfile.color }}
              />
              <span className="truncate">{selectedProfile.name}</span>
              {selectedProfile.teamId && (
                <IconUsers className="h-3.5 w-3.5 shrink-0 text-muted" />
              )}
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {personalProfiles.length > 0 && (
          <SelectGroup>
            <SelectLabel>Personal</SelectLabel>
            {personalProfiles.map((profile) => (
              <ProfileRow key={profile._id} profile={profile} />
            ))}
          </SelectGroup>
        )}
        {personalProfiles.length > 0 && teamProfiles.length > 0 && (
          <SelectSeparator />
        )}
        {teamProfiles.length > 0 && (
          <SelectGroup>
            <SelectLabel>Teams</SelectLabel>
            {teamProfiles.map((profile) => (
              <ProfileRow key={profile._id} profile={profile} isTeam />
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

function ProfileRow({
  profile,
  isTeam,
}: {
  profile: ProfileListItem;
  isTeam?: boolean;
}) {
  const Icon = getProfileIcon(profile.icon);
  return (
    <SelectItem value={profile._id}>
      <div className="flex items-center gap-2">
        <div
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: profile.color }}
        />
        <Icon className="h-4 w-4 shrink-0 text-muted" />
        <span>{profile.name}</span>
        {isTeam && (
          <span className="ml-auto rounded-md bg-surface-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted">
            Team
          </span>
        )}
      </div>
    </SelectItem>
  );
}
