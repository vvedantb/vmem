"use client";

import { useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
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

  return (
    <div className="flex flex-col gap-0.5">
      <TeamSidebarCard
        entry={entry}
        selected={isSelected}
        onSelect={() => {
          void navigate({
            to: "/teams/$teamId/overview",
            params: { teamId: entry.team._id },
          });
        }}
      />
      {isSelected && !isIconOnly && activeSection !== null ? (
        <TeamSidebarSubNav
          teamId={entry.team._id}
          isOwner={isOwner}
          activeSection={activeSection}
        />
      ) : null}
    </div>
  );
}
