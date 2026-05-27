"use client";

import { Breadcrumb, BreadcrumbPage } from "@vmem/ui";

interface SkillPageTitleProps {
  name: string;
  onNameChange: (value: string) => void;
  onNameCommit: () => void;
}

export function SkillPageTitle({
  name,
  onNameChange,
  onNameCommit,
}: SkillPageTitleProps) {
  return (
    <Breadcrumb className="w-full min-w-0">
      <BreadcrumbPage className="min-w-0 flex-1">
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onNameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="Untitled skill"
          aria-label="Skill name"
          className="w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-muted/50"
        />
      </BreadcrumbPage>
    </Breadcrumb>
  );
}
