"use client";

import type { Doc } from "@vmem/backend";

interface ViewSkillPanelProps {
  skill: Doc<"skills">;
}

export function ViewSkillPanel({ skill }: ViewSkillPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-thin px-4 pb-4 pt-2">
      {skill.description ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted">Description</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {skill.description}
          </p>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-1.5">
        <p className="text-xs font-medium text-muted">Instructions</p>
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
          {skill.instructions}
        </pre>
      </div>
    </div>
  );
}
