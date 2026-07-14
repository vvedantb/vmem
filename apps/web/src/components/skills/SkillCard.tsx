"use client";

import type { KeyboardEvent } from "react";
import type { Doc } from "@vmem/backend";
import { Checkbox, cn } from "@vmem/ui";
import { sidebarListRowClass } from "@/components/sidebar/sidebar-nav-row";

interface SkillCardProps {
  skill: Doc<"skills">;
  selected?: boolean;
  onSelect: () => void;
  /** navigate = open skill; bulk-select = checkbox toggle */
  mode?: "navigate" | "bulk-select";
  checked?: boolean;
  onToggleSelect?: () => void;
}

export function SkillCard({
  skill,
  selected,
  onSelect,
  mode = "navigate",
  checked = false,
  onToggleSelect,
}: SkillCardProps) {
  const isEnabled = skill.enabled !== false;
  const bulkSelect = mode === "bulk-select";

  const activate = () => {
    if (bulkSelect) {
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

  const highlighted = bulkSelect ? checked : selected;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${skill.name}, ${isEnabled ? "active" : "disabled"}`}
      onClick={activate}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-w-0 items-center rounded-lg text-left text-sm cursor-pointer transition-[color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        sidebarListRowClass,
        highlighted ? "text-foreground" : "text-muted hover:text-foreground",
      )}
    >
      {bulkSelect ? (
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
      <span className="min-w-0 truncate">{skill.name}</span>
    </div>
  );
}
