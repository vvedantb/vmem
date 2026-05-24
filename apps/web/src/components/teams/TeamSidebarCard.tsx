"use client";

import type { KeyboardEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { cn } from "@vmem/ui";
import { IconBuilding } from "@tabler/icons-react";

type TeamListEntry = FunctionReturnType<typeof api.teams.list>[number];

interface TeamSidebarCardProps {
  entry: TeamListEntry;
  selected?: boolean;
  /** Selected team with expanded section links — header sits inside the group surface. */
  inGroup?: boolean;
  onSelect: () => void;
}

function memberCountLabel(count: number): string {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

export function TeamSidebarCard({
  entry,
  selected,
  inGroup = false,
  onSelect,
}: TeamSidebarCardProps) {
  const { team, role, profile, memberCount } = entry;
  const profileColor = profile?.color;

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
        "flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        selected && inGroup
          ? "text-foreground"
          : selected
            ? "glass-interactive text-foreground dark:bg-muted/80 dark:border-transparent dark:shadow-none"
            : "text-muted-foreground hover:bg-card/45 hover:text-foreground dark:hover:bg-muted/40",
      )}
    >
      {profileColor ? (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: profileColor }}
        />
      ) : (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <IconBuilding size={14} stroke={1.7} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {team.name}
        </div>
        <div className="truncate text-xs text-muted-foreground capitalize">
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
