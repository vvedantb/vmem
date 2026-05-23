"use client";

import type { KeyboardEvent } from "react";
import type { Doc } from "@vmem/backend";
import { IconBolt } from "@tabler/icons-react";
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
        "flex min-w-0 items-center gap-2 rounded-xl px-3 py-3 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        selected ? "bg-muted/80" : "hover:bg-muted/40",
      )}
    >
      <IconBolt size={16} className="shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-semibold text-foreground">
        {skill.name}
      </span>
    </div>
  );
}
