import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@vmem/ui";
import { toast } from "sonner";
import { SkillFormShell } from "@/components/skills/SkillFormShell";

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
  const updateSkill = useMutation(api.skills.updateSkill);

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

        <SkillFormShell
          name={skill.name}
          description={skill.description}
          instructions={skill.instructions}
          onNameChange={(value) => {
            void updateSkill({ id: skill._id, name: value });
          }}
          onDescriptionChange={(value) => {
            void updateSkill({ id: skill._id, description: value });
          }}
          onInstructionsChange={(value) => {
            void updateSkill({ id: skill._id, instructions: value });
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void handleDone();
          }}
          onCancel={() => onOpenChange(false)}
          submitting={submitting}
          submitLabel="Done"
          nameId="edit-skill-name"
          descriptionId="edit-skill-description"
          instructionsId="edit-skill-instructions"
          labeledSections
        />
      </DialogContent>
    </Dialog>
  );
}
