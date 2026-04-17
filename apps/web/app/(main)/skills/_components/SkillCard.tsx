"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vmem/ui";
import { IconDots, IconPencil, IconTrash, IconBolt } from "@tabler/icons-react";
import { toast } from "sonner";
import { EditSkillDialog } from "./EditSkillDialog";

interface SkillCardProps {
  skill: Doc<"skills">;
}

export function SkillCard({ skill }: SkillCardProps) {
  const deleteSkill = useMutation(api.skills.deleteSkill);
  const [editOpen, setEditOpen] = useState(false);

  const handleDelete = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete skill "${skill.name}"?`)) return;
    try {
      await deleteSkill({ id: skill._id });
      toast.success(`Deleted ${skill.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast.error(msg);
    }
  };

  const handleEdit = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditOpen(true);
  };

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setEditOpen(true);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditOpen(true)}
        onKeyDown={handleCardKeyDown}
        className="group relative flex flex-col gap-2 rounded-xl bg-muted/40 hover:bg-muted/60 px-4 py-4 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <IconBolt size={16} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate">
              {skill.name}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
                aria-label="Skill actions"
              >
                <IconDots size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={handleEdit}>
                <IconPencil size={14} className="mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <IconTrash size={14} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {skill.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {skill.description}
          </p>
        )}

        {skill.instructions && (
          <p className="text-xs text-muted-foreground/80 line-clamp-3 whitespace-pre-wrap font-mono">
            {skill.instructions}
          </p>
        )}
      </div>

      <EditSkillDialog
        skill={skill}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
