"use client";

import type { Doc } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconBolt, IconPencil, IconX } from "@tabler/icons-react";

interface ViewSkillPanelProps {
  skill: Doc<"skills">;
  onClose: () => void;
  onEdit: () => void;
}

export function ViewSkillPanel({
  skill,
  onClose,
  onEdit,
}: ViewSkillPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconBolt size={16} className="shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold">{skill.name}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <IconPencil size={14} />
            Edit
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close panel"
          >
            <IconX size={18} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {skill.description ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Description
            </p>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {skill.description}
            </p>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Instructions
          </p>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
            {skill.instructions}
          </pre>
        </div>
      </div>
    </div>
  );
}
