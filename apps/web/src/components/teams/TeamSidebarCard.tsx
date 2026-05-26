"use client";

import type { KeyboardEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { cn } from "@vmem/ui";
import { IconBuilding } from "@tabler/icons-react";
import { getProfileIcon } from "@/components/profiles/profile-icon";

type TeamListEntry = FunctionReturnType<typeof api.teams.list>[number];

interface TeamSidebarCardProps {
  entry: TeamListEntry;
  selected?: boolean;
  onSelect: () => void;
}

function memberCountLabel(count: number): string {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

export function TeamSidebarCard({
  entry,
  selected,
  onSelect,
}: TeamSidebarCardProps) {
  const { team, role, profile, memberCount } = entry;
  const profileColor = profile?.color;
  const ProfileIcon = profile ? getProfileIcon(profile.icon) : null;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${team.name}, ${role}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        selected
          ? "bg-surface-tertiary text-foreground"
          : "text-muted hover:bg-surface-tertiary hover:text-foreground",
      )}
    >
      {profile && ProfileIcon ? (
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: profileColor ? `${profileColor}20` : undefined,
          }}
        >
          <ProfileIcon
            size={16}
            stroke={1.7}
            className={profileColor ? undefined : "text-muted"}
            style={profileColor ? { color: profileColor } : undefined}
          />
        </div>
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-secondary/60 text-muted">
          <IconBuilding size={16} stroke={1.7} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {team.name}
        </div>
        <div className="truncate text-xs text-muted capitalize">
          {role}
          <span className="normal-case">
            {" "}
            · {memberCountLabel(memberCount)}
          </span>
        </div>
      </div>
    </div>
  );
}
