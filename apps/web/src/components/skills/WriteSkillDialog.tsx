"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
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
import { optimisticId } from "@/lib/optimisticId";
import { prependOptimisticSkillRow } from "@/components/skills/_utils";
import { useActiveTeamId } from "@/components/workspace/active-profile";

interface WriteSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (skillId: Id<"skills">) => void;
}

export function WriteSkillDialog({
  open,
  onOpenChange,
  onCreated,
}: WriteSkillDialogProps) {
  const teamId = useActiveTeamId();
  const createSkill = useMutation(api.skills.createSkill).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.skills.listMy, { teamId });
      if (!current) return;
      localStore.setQuery(
        api.skills.listMy,
        { teamId },
        prependOptimisticSkillRow(current, optimisticId("skills"), args),
      );
    },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setDescription("");
    setInstructions("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

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
      const skillId = await createSkill({
        name: trimmedName,
        description: description.trim(),
        instructions,
        teamId,
      });
      toast.success(`Added ${trimmedName}`);
      resetForm();
      onOpenChange(false);
      onCreated(skillId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add skill";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Write skill</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        >
          <Input
            id="skill-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
            autoFocus
          />

          <Textarea
            id="skill-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this skill is for"
            aria-label="Description"
            rows={3}
            className="min-h-[4.5rem] resize-y"
          />

          <Textarea
            id="skill-instructions"
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
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : null}
              Add Skill
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
