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
  IconBolt,
  IconDots,
  IconLoader2,
  IconPencil,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

interface ViewSkillPanelProps {
  skill: Doc<"skills">;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

export function ViewSkillPanel({
  skill,
  onClose,
  onEdit,
  onDeleted,
}: ViewSkillPanelProps) {
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
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <IconBolt size={16} className="shrink-0 text-muted-foreground" />
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
              {skill.name}
            </h2>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => {
                void handleEnabledChange(checked);
              }}
              aria-label={isEnabled ? "Disable skill" : "Enable skill"}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label="Skill actions"
                >
                  <IconDots size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
