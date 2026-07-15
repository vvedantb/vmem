import type { KeyboardEvent, ReactNode } from "react";
import type { Doc } from "@vmem/backend";
import { Checkbox, cn } from "@vmem/ui";
import { sidebarListRowClass } from "@/components/sidebar/sidebar-nav-row";

interface SkillCardShellProps {
  skill: Doc<"skills">;
  highlighted: boolean;
  onActivate: () => void;
  leading: ReactNode;
}

function SkillCardShell({
  skill,
  highlighted,
  onActivate,
  leading,
}: SkillCardShellProps) {
  const isEnabled = skill.enabled !== false;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${skill.name}, ${isEnabled ? "active" : "disabled"}`}
      onClick={onActivate}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-w-0 items-center rounded-lg text-left text-sm cursor-pointer transition-[color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        sidebarListRowClass,
        highlighted ? "text-foreground" : "text-muted hover:text-foreground",
      )}
    >
      {leading}
      <span className="min-w-0 truncate">{skill.name}</span>
    </div>
  );
}

interface NavigateSkillCardProps {
  skill: Doc<"skills">;
  selected?: boolean;
  onSelect: () => void;
}

function NavigateSkillCard({
  skill,
  selected,
  onSelect,
}: NavigateSkillCardProps) {
  const isEnabled = skill.enabled !== false;

  return (
    <SkillCardShell
      skill={skill}
      highlighted={selected ?? false}
      onActivate={onSelect}
      leading={
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            isEnabled ? "bg-success" : "bg-default",
          )}
        />
      }
    />
  );
}

interface BulkSelectSkillCardProps {
  skill: Doc<"skills">;
  checked: boolean;
  onToggleSelect: () => void;
}

function BulkSelectSkillCard({
  skill,
  checked,
  onToggleSelect,
}: BulkSelectSkillCardProps) {
  return (
    <SkillCardShell
      skill={skill}
      highlighted={checked}
      onActivate={onToggleSelect}
      leading={
        <Checkbox
          checked={checked}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none shrink-0"
        />
      }
    />
  );
}

interface SkillCardProps {
  skill: Doc<"skills">;
  selected?: boolean;
  onSelect: () => void;
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
  if (mode === "bulk-select") {
    return (
      <BulkSelectSkillCard
        skill={skill}
        checked={checked}
        onToggleSelect={() => onToggleSelect?.()}
      />
    );
  }

  return (
    <NavigateSkillCard skill={skill} selected={selected} onSelect={onSelect} />
  );
}
