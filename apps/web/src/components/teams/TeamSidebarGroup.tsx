"use client";

import { useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { cn } from "@vmem/ui";
import { TeamSidebarCard } from "./TeamSidebarCard";
import { TeamSidebarSubNav } from "./TeamSidebarSubNav";
import type { TeamSectionId } from "./team-sidebar-sections";

type TeamListEntry = FunctionReturnType<typeof api.teams.list>[number];

interface TeamSidebarGroupProps {
  entry: TeamListEntry;
  isSelected: boolean;
  isIconOnly: boolean;
  activeSection: TeamSectionId | null;
}

export function TeamSidebarGroup({
  entry,
  isSelected,
  isIconOnly,
  activeSection,
}: TeamSidebarGroupProps) {
  const navigate = useNavigate();
  const isOwner = entry.role === "owner";
  const isExpanded = isSelected && !isIconOnly && activeSection !== null;

  return (
    <div
      className={cn(
        "flex flex-col",
        isExpanded
          ? "gap-0.5 rounded-lg bg-surface-secondary/40 p-1"
          : undefined,
      )}
    >
      <TeamSidebarCard
        entry={entry}
        selected={isSelected}
        inGroup={isExpanded}
        onSelect={() => {
          void navigate({
            to: "/teams/$teamId/overview",
            params: { teamId: entry.team._id },
          });
        }}
      />
      {isExpanded ? (
        <TeamSidebarSubNav
          teamId={entry.team._id}
          isOwner={isOwner}
          activeSection={activeSection}
        />
      ) : null}
    </div>
  );
}
