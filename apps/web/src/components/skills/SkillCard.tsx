"use client";

import type { KeyboardEvent } from "react";
import type { Doc } from "@vmem/backend";
import { cn } from "@vmem/ui";
import { sidebarListRowClass } from "@/components/sidebar/sidebar-nav-row";

interface SkillCardProps {
  skill: Doc<"skills">;
  selected?: boolean;
  onSelect: () => void;
}

export function SkillCard({ skill, selected, onSelect }: SkillCardProps) {
  const isEnabled = skill.enabled !== false;

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
      aria-label={`${skill.name}, ${isEnabled ? "active" : "disabled"}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-w-0 items-center rounded-lg text-left cursor-pointer transition-[color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        sidebarListRowClass,
        selected ? "text-foreground" : "text-muted hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          isEnabled ? "bg-success" : "bg-default",
        )}
      />
      <span
        className={cn(
          "min-w-0 truncate text-sm font-semibold",
          isEnabled ? "text-foreground" : "text-muted",
        )}
      >
        {skill.name}
      </span>
    </div>
  );
}
