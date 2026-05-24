"use client";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Id } from "@vmem/backend";
import { cn } from "@vmem/ui";
import {
  IconBrain,
  IconLayoutDashboard,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { getTeamSections, type TeamSectionId } from "./team-sidebar-sections";

const teamSectionIcons: Record<TeamSectionId, ReactNode> = {
  overview: <IconLayoutDashboard size={14} stroke={1.7} />,
  knowledge: <IconBrain size={14} stroke={1.7} />,
  members: <IconUsers size={14} stroke={1.7} />,
  settings: <IconSettings size={14} stroke={1.7} />,
};

interface TeamSidebarSubNavProps {
  teamId: Id<"teams">;
  isOwner: boolean;
  activeSection: TeamSectionId;
}

export function TeamSidebarSubNav({
  teamId,
  isOwner,
  activeSection,
}: TeamSidebarSubNavProps) {
  const sections = getTeamSections(isOwner);

  return (
    <ul className="mb-1 ml-9 flex flex-col gap-0.5">
      {sections.map((section) => (
        <li key={section.id}>
          <Link
            to={section.to}
            params={{ teamId }}
            className={cn(
              "flex items-center gap-2 rounded-lg py-1.5 pl-3 pr-2 text-xs font-medium transition-[background-color]",
              activeSection === section.id
                ? "glass-interactive text-foreground dark:bg-muted/80 dark:border-transparent dark:shadow-none"
                : "text-muted-foreground hover:bg-card/45 hover:text-foreground dark:hover:bg-muted/40",
            )}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {teamSectionIcons[section.id]}
            </span>
            {section.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
