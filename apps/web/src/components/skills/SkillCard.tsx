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
        "flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        selected
          ? "bg-muted/40 text-foreground"
          : "hover:bg-card/45 dark:hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          isEnabled ? "bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      <span
        className={cn(
          "min-w-0 truncate text-sm font-semibold",
          isEnabled ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {skill.name}
      </span>
    </div>
  );
}
