"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { patchSkillListMy } from "@/components/skills/_utils";

interface EditSkillDialogProps {
  skill: Doc<"skills"> | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSkillDialog({
  skill,
  open,
  onOpenChange,
}: EditSkillDialogProps) {
  const updateSkill = useMutation(api.skills.updateSkill).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.skills.listMy, {
        teamId: skill?.teamId,
      });
      if (!current) return;
      localStore.setQuery(
        api.skills.listMy,
        { teamId: skill?.teamId },
        patchSkillListMy(current, args.id, args),
      );
    },
  );

  const [submitting, setSubmitting] = useState(false);

  const handleDone = async () => {
    if (submitting || !skill) return;

    const trimmedName = skill.name.trim();
    if (trimmedName.length === 0) {
      toast.error("Name is required");
      return;
    }
    if (skill.instructions.trim().length === 0) {
      toast.error("Instructions are required");
      return;
    }

    if (trimmedName !== skill.name) {
      setSubmitting(true);
      try {
        await updateSkill({ id: skill._id, name: trimmedName });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to update skill";
        toast.error(msg);
        return;
      } finally {
        setSubmitting(false);
      }
    }

    onOpenChange(false);
  };

  if (!skill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit skill</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleDone();
          }}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        >
          <Input
            id="edit-skill-name"
            value={skill.name}
            onChange={(e) => {
              void updateSkill({ id: skill._id, name: e.target.value });
            }}
            placeholder="Name"
            aria-label="Name"
            autoFocus
          />

          <Textarea
            id="edit-skill-description"
            value={skill.description}
            onChange={(e) => {
              void updateSkill({
                id: skill._id,
                description: e.target.value,
              });
            }}
            placeholder="What this skill is for"
            aria-label="Description"
            rows={3}
            className="min-h-[4.5rem] resize-y"
          />

          <Textarea
            id="edit-skill-instructions"
            value={skill.instructions}
            onChange={(e) => {
              void updateSkill({
                id: skill._id,
                instructions: e.target.value,
              });
            }}
            placeholder="Instructions"
            aria-label="Instructions"
            className="min-h-[240px] font-mono text-xs"
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : null}
              Done
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
