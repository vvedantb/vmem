"use client";

import type { KeyboardEvent } from "react";
import type { Doc } from "@vmem/backend";
import { cn } from "@vmem/ui";

interface SkillCardProps {
  skill: Doc<"skills">;
  selected?: boolean;
  onSelect: () => void;
}

export function SkillCard({ skill, selected, onSelect }: SkillCardProps) {
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
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-w-0 items-center rounded-xl px-3 py-2 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        selected ? "bg-muted/80" : "hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "truncate text-sm font-semibold",
          skill.enabled === false ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {skill.name}
      </span>
    </div>
  );
}
