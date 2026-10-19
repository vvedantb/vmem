import type { KeyboardEvent, ReactNode } from "react";
import type { Doc } from "@vmem/backend";
import { Checkbox, Sidebar, cn } from "@vvedantb/ui";

interface SkillCardShellProps {
  skill: Doc<"skills">;
  // navigate: current skill route (fill + font-medium); bulk: checked (fill only)
  active: boolean;
  selected: boolean;
  onActivate: () => void;
  leading: ReactNode;
}

function SkillCardShell({
  skill,
  active,
  selected,
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

  // div row (not <button>): the bulk-select leading Checkbox is itself a button
  return (
    <Sidebar.NavItem asChild active={active} selected={selected}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${skill.name}, ${isEnabled ? "active" : "disabled"}`}
        onClick={onActivate}
        onKeyDown={handleKeyDown}
        className="min-w-0 cursor-pointer text-left"
      >
        <Sidebar.NavItemLeading>{leading}</Sidebar.NavItemLeading>
        <Sidebar.NavItemLabel>{skill.name}</Sidebar.NavItemLabel>
      </div>
    </Sidebar.NavItem>
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
      active={selected ?? false}
      selected={false}
      onActivate={onSelect}
      leading={
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
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
      active={false}
      selected={checked}
      onActivate={onToggleSelect}
      leading={
        <Checkbox
          checked={checked}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none"
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
