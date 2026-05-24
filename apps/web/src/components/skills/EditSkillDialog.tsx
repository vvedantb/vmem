"use client";

import { useEffect, useState, type FormEvent } from "react";
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
      const current = localStore.getQuery(api.skills.listMy, {});
      if (!current) return;
      const now = Date.now();
      localStore.setQuery(
        api.skills.listMy,
        {},
        current.map((row) => {
          if (row._id !== args.id) return row;
          return {
            ...row,
            ...(args.name !== undefined ? { name: args.name.trim() } : {}),
            ...(args.description !== undefined
              ? { description: args.description }
              : {}),
            ...(args.instructions !== undefined
              ? { instructions: args.instructions }
              : {}),
            ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
            updatedAt: now,
          };
        }),
      );
    },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!skill) return;
    setName(skill.name);
    setDescription(skill.description);
    setInstructions(skill.instructions);
  }, [skill]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !skill) return;

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

  if (!skill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit skill</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        >
          <Input
            id="edit-skill-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
            autoFocus
          />

          <Textarea
            id="edit-skill-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this skill is for"
            aria-label="Description"
            rows={3}
            className="min-h-[4.5rem] resize-y"
          />

          <Textarea
            id="edit-skill-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
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
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
