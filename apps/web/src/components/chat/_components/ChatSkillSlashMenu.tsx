import { Link } from "@tanstack/react-router";
import type { Doc } from "@vmem/backend";
import { cn } from "@vmem/ui";
import { IconSkills } from "@/components/sidebar-icons";

interface ChatSkillSlashMenuProps {
  skills: Doc<"skills">[] | undefined;
  filteredSkills: Doc<"skills">[];
  highlightIndex: number;
  onSelect: (skill: Doc<"skills">) => void;
}

function isSkillEnabled(skill: Doc<"skills">): boolean {
  return skill.enabled !== false;
}

export function ChatSkillSlashMenu({
  skills,
  filteredSkills,
  highlightIndex,
  onSelect,
}: ChatSkillSlashMenuProps) {
  const safeHighlight =
    filteredSkills.length === 0
      ? 0
      : Math.min(highlightIndex, filteredSkills.length - 1);

  return (
    <>
      <p className="px-3 pb-1.5 pt-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Skills
      </p>
      {skills === undefined ? (
        <p className="px-3 pb-3 text-sm text-muted-foreground">
          Loading skills…
        </p>
      ) : filteredSkills.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-muted-foreground">
          {skills.filter(isSkillEnabled).length === 0 ? (
            <>
              No skills yet.{" "}
              <Link
                to="/skills"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Create one
              </Link>
            </>
          ) : (
            "No matching skills"
          )}
        </p>
      ) : (
        <ul
          role="listbox"
          aria-label="Skills"
          className="max-h-52 overflow-y-auto scrollbar-thin px-1.5 pb-1.5 [scrollbar-gutter:stable]"
        >
          {filteredSkills.map((skill, index) => (
            <li key={skill._id}>
              <button
                type="button"
                role="option"
                aria-selected={index === safeHighlight}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-[background-color]",
                  index === safeHighlight
                    ? "bg-surface-tertiary text-foreground"
                    : "text-foreground hover:bg-surface-tertiary",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(skill)}
              >
                <IconSkills
                  size={16}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">/{skill.name}</span>
                  {skill.description ? (
                    <span className="mt-0.5 block truncate text-xs text-muted/80">
                      {skill.description}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
