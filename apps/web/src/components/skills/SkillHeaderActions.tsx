import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import {
  Button,
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
  IconHistory,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";
import { formatSkillForClipboard } from "./_utils";
import { SkillHistoryPanel } from "./SkillHistoryPanel";

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
  const [historyOpen, setHistoryOpen] = useState(false);

  const deleteSkill = useMutation(api.skills.deleteSkill);
  const updateSkill = useMutation(api.skills.updateSkill);

  const isEnabled = skill.enabled !== false;

  const handleEnabledChange = (checked: boolean) => {
    void updateSkill({ id: skill._id, enabled: checked }).catch((err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to update skill",
      );
    });
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
            className="shrink-0 text-muted"
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
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <IconHistory size={14} />
            Version history
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-danger focus:text-danger data-[highlighted]:text-danger"
            onSelect={() => setDeleteConfirmOpen(true)}
          >
            <IconTrash size={14} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DestructiveConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete skill?"
        description="This cannot be undone."
        confirmLabel="Delete"
        submittingLabel="Deleting..."
        submitting={deleting}
        onConfirm={() => {
          void handleDelete();
        }}
      >
        &quot;{skill.name}&quot; will be permanently removed.
      </DestructiveConfirmDialog>

      <SkillHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        skillId={skill._id}
      />
    </>
  );
}
