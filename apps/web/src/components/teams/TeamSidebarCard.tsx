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
  onSelect: () => void;
}

export function TeamSidebarCard({
  entry,
  selected,
  onSelect,
}: TeamSidebarCardProps) {
  const { team, role, profile } = entry;

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
        "flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        selected
          ? "glass-interactive text-foreground dark:bg-muted/80 dark:border-transparent dark:shadow-none"
          : "hover:bg-card/45 dark:hover:bg-muted/40",
      )}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{
          backgroundColor: profile?.color ? `${profile.color}22` : undefined,
        }}
      >
        <IconBuilding
          size={16}
          style={{ color: profile?.color }}
          className="text-muted-foreground"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {team.name}
        </div>
        <div className="truncate text-xs capitalize text-muted-foreground">
          {role}
        </div>
      </div>
    </div>
  );
}
