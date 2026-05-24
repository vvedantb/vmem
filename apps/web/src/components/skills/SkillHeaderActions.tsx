"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
} from "@vmem/ui";
import {
  IconCopy,
  IconDots,
  IconLoader2,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { formatSkillForClipboard } from "./_utils";

interface SkillHeaderActionsProps {
  skill: Doc<"skills">;
  onEdit: () => void;
  onDeleted: () => void;
}

export function SkillHeaderActions({
  skill,
  onEdit,
  onDeleted,
}: SkillHeaderActionsProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteSkill = useMutation(api.skills.deleteSkill);
  const updateSkill = useMutation(api.skills.updateSkill).withOptimisticUpdate(
    (localStore, args) => {
      if (args.enabled === undefined) return;
      const current = localStore.getQuery(api.skills.listMy, {});
      if (!current) return;
      localStore.setQuery(
        api.skills.listMy,
        {},
        current.map((row) =>
          row._id === args.id
            ? { ...row, enabled: args.enabled, updatedAt: Date.now() }
            : row,
        ),
      );
    },
  );

  const isEnabled = skill.enabled !== false;

  const handleEnabledChange = async (checked: boolean) => {
    try {
      await updateSkill({ id: skill._id, enabled: checked });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update skill",
      );
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatSkillForClipboard(skill));
      toast.success("Skill copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSkill({ id: skill._id });
      toast.success(`Deleted ${skill.name}`);
      setDeleteConfirmOpen(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label="Skill actions"
          >
            <IconDots size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="flex items-center justify-between gap-4"
            onSelect={(e) => e.preventDefault()}
          >
            <span>Enabled</span>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => {
                void handleEnabledChange(checked);
              }}
              aria-label={isEnabled ? "Disable skill" : "Enable skill"}
              onClick={(e) => e.stopPropagation()}
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              void handleCopy();
            }}
          >
            <IconCopy size={14} />
            Copy skill
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            <IconPencil size={14} />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteConfirmOpen(true)}
          >
            <IconTrash size={14} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteConfirmOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete skill?</DialogTitle>
            <DialogDescription>
              &quot;{skill.name}&quot; will be permanently removed. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleDelete();
              }}
              disabled={deleting}
            >
              {deleting ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : (
                <IconTrash size={14} />
              )}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
