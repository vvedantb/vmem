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
        "flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        selected ? "bg-muted/80" : "hover:bg-muted/40",
      )}
    >
      <IconBolt
        size={16}
        className={cn(
          "shrink-0",
          skill.enabled === false
            ? "text-muted-foreground/50"
            : "text-muted-foreground",
        )}
      />
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
