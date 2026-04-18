"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

interface EditSkillDialogProps {
  skill: Doc<"skills">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSkillDialog({
  skill,
  open,
  onOpenChange,
}: EditSkillDialogProps) {
  const updateSkill = useMutation(api.skills.updateSkill);

  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [instructions, setInstructions] = useState(skill.instructions);
  const [submitting, setSubmitting] = useState(false);

  // Re-sync local form state whenever the dialog opens or the underlying skill
  // changes (e.g. after an update). Avoids stale values if the card is reused.
  useEffect(() => {
    if (open) {
      setName(skill.name);
      setDescription(skill.description);
      setInstructions(skill.instructions);
    }
  }, [open, skill.name, skill.description, skill.instructions]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      toast.error("Name is required");
      return;
    }
    if (instructions.trim().length === 0) {
      toast.error("Instructions are required");
      return;
    }

    setSubmitting(true);
    try {
      await updateSkill({
        id: skill._id,
        name: trimmedName,
        description: description.trim(),
        instructions,
      });
      toast.success(`Updated ${trimmedName}`);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update skill";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Skill</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-skill-name">Name</Label>
            <Input
              id="edit-skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-skill-description">Description</Label>
            <Input
              id="edit-skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this skill is for"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-skill-instructions">Instructions</Label>
            <Textarea
              id="edit-skill-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[240px] font-mono text-xs"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <IconLoader2 size={14} className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
