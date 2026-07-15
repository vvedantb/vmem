"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@vmem/ui";
import { toast } from "sonner";
import { optimisticId } from "@/lib/optimisticId";
import { prependOptimisticSkillRow } from "@/components/skills/_utils";
import { SkillFormShell } from "@/components/skills/SkillFormShell";
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

        <SkillFormShell
          name={name}
          description={description}
          instructions={instructions}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onInstructionsChange={setInstructions}
          onSubmit={handleSubmit}
          onCancel={() => handleOpenChange(false)}
          submitting={submitting}
          submitLabel="Add Skill"
          nameId="skill-name"
          descriptionId="skill-description"
          instructionsId="skill-instructions"
        />
      </DialogContent>
    </Dialog>
  );
}
