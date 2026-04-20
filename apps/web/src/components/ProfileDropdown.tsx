"use client";

import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import {
  cn,
  Select,
  SelectContent,
  SelectItem,
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
} from "@tabler/icons-react";
import { api } from "@vmem/backend";

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

  return (
    <Select
      value={effectiveValue}
      onValueChange={onChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger
        className={cn(
          "h-10 w-auto min-w-[140px] bg-muted/50 border-border hover:bg-accent",
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
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {profiles?.map((profile) => {
          const Icon = getProfileIcon(profile.icon);
          return (
            <SelectItem key={profile._id} value={profile._id}>
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: profile.color }}
                />
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{profile.name}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
