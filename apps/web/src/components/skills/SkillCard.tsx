"use client";

import type { KeyboardEvent } from "react";
import type { Doc } from "@vmem/backend";
import { Checkbox, cn } from "@vmem/ui";
import { sidebarListRowClass } from "@/components/sidebar/sidebar-nav-row";

interface SkillCardProps {
  skill: Doc<"skills">;
  selected?: boolean;
  onSelect: () => void;
  /** When true, the row shows a checkbox and activating it toggles selection. */
  selectionMode?: boolean;
  checked?: boolean;
  onToggleSelect?: () => void;
}

export function SkillCard({
  skill,
  selected,
  onSelect,
  selectionMode = false,
  checked = false,
  onToggleSelect,
}: SkillCardProps) {
  const isEnabled = skill.enabled !== false;

  const activate = () => {
    if (selectionMode) {
      onToggleSelect?.();
    } else {
      onSelect();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  const highlighted = selectionMode ? checked : selected;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${skill.name}, ${isEnabled ? "active" : "disabled"}`}
      onClick={activate}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-w-0 items-center rounded-lg text-left cursor-pointer transition-[color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        sidebarListRowClass,
        highlighted ? "text-foreground" : "text-muted hover:text-foreground",
      )}
    >
      {selectionMode ? (
        <Checkbox
          checked={checked}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none shrink-0"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            isEnabled ? "bg-success" : "bg-default",
          )}
        />
      )}
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
