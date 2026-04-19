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
        "group relative flex flex-col gap-2 rounded-xl px-4 py-4 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        selected
          ? "bg-muted/80 ring-2 ring-ring/30"
          : "bg-muted/40 hover:bg-muted/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <IconBolt size={16} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">
            {skill.name}
          </span>
        </div>
      </div>

      {skill.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {skill.description}
        </p>
      )}

      {skill.instructions && (
        <p className="text-xs text-muted-foreground/80 line-clamp-3 whitespace-pre-wrap font-mono">
          {skill.instructions}
        </p>
      )}
    </div>
  );
}
