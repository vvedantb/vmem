"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { useConvexAuth } from "convex/react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  cn,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Skeleton,
  motionDuration,
  motionEase,
} from "@vmem/ui";
import {
  IconCheck,
  IconChevronDown,
  IconSettings,
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
import { useEffect, useMemo, useState, type MouseEventHandler } from "react";

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

interface ProfileSelectorProps {
  isCollapsed: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}

interface ProfileStatsMap {
  [profileId: string]: { total: number; today: number };
}

export function ProfileSelector({
  isCollapsed,
  isMobile,
  onNavigate,
}: ProfileSelectorProps) {
  const { isAuthenticated } = useConvexAuth();
  const profiles = useQuery(api.profiles.list, isAuthenticated ? {} : "skip");
  const activeProfile = useQuery(
    api.profiles.getActive,
    isAuthenticated ? {} : "skip",
  );
  const setActive = useMutation(api.profiles.setActive);
  const getProfilesStats = useAction(api.dashboardApi.getProfilesStats);
  const [open, setOpen] = useState(false);
  const [profileStats, setProfileStats] = useState<ProfileStatsMap>({});

  // Fetch stats for all profiles when profiles are loaded
  const profileIds = useMemo(
    () => profiles?.map((p) => p._id) ?? [],
    [profiles],
  );

  useEffect(() => {
    if (!isAuthenticated || profileIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const stats = await getProfilesStats({ profileIds });
        if (!cancelled) {
          setProfileStats(stats as ProfileStatsMap);
        }
      } catch {
        // silently fail -- stats in popover are non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, profileIds.join(",")]);

  const isIconOnly = !isMobile && isCollapsed;
  const isLoading = profiles === undefined || activeProfile === undefined;

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={cn("px-2", isIconOnly ? "flex justify-center" : "")}>
        <Skeleton
          className={cn("h-10 rounded-lg", isIconOnly ? "w-10" : "w-full")}
        />
      </div>
    );
  }

  const ProfileIcon = activeProfile
    ? getProfileIcon(activeProfile.icon)
    : IconUser;

  const handleSelectProfile = async (profileId: string) => {
    await setActive({
      profileId: profileId as Parameters<typeof setActive>[0]["profileId"],
    });
    setOpen(false);
  };

  // Collapsed mode: just colored dot with HoverCard
  if (isIconOnly) {
    return (
      <div className="flex justify-center px-2">
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="glass-interactive flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
            >
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: activeProfile?.color ?? "#3B82F6" }}
              />
            </button>
          </HoverCardTrigger>
          <HoverCardContent side="right" align="center" className="w-auto p-3">
            <div className="flex items-center gap-2">
              <ProfileIcon className="h-4 w-4" />
              <span className="text-sm font-medium">
                {activeProfile?.name ?? "Personal"}
              </span>
            </div>
            {profiles && profiles.length > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {profiles.length} profiles
              </p>
            )}
          </HoverCardContent>
        </HoverCard>
      </div>
    );
  }

  return (
    <div className="px-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between gap-2 h-10 px-3 rounded-lg glass-interactive"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: activeProfile?.color ?? "#3B82F6" }}
              />
              <span className="truncate text-sm font-medium">
                {activeProfile?.name ?? "Personal"}
              </span>
            </div>
            <IconChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side={isMobile ? "top" : "right"}
          className="w-56 p-1"
        >
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: motionDuration.fast, ease: motionEase }}
            >
              <div className="space-y-0.5">
                {profiles?.map((profile) => {
                  const Icon = getProfileIcon(profile.icon);
                  const isActive = profile._id === activeProfile?._id;
                  const stats = profileStats[profile._id];
                  return (
                    <button
                      key={profile._id}
                      type="button"
                      onClick={() => handleSelectProfile(profile._id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted",
                      )}
                    >
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: profile.color }}
                      />
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-left">
                        {profile.name}
                      </span>
                      {stats !== undefined && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {stats.total}
                        </span>
                      )}
                      {isActive && (
                        <IconCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 pt-1 border-t border-border">
                <Link
                  to="/settings/profiles"
                  onClick={(e) => {
                    setOpen(false);
                    onNavigate?.(e);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <IconSettings className="h-4 w-4" />
                  <span>Manage Profiles</span>
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </PopoverContent>
      </Popover>
    </div>
  );
}
