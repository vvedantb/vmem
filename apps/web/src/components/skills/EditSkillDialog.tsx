import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@vvedantb/ui";
import { toast } from "sonner";
import { SkillFormShell } from "@/components/skills/SkillFormShell";
import {
  skillFormSchema,
  skillFormValuesFrom,
  toastSkillFormErrors,
  type SkillFormValues,
} from "@/components/skills/skillForm";
import { patchSkillInLists } from "@/lib/convex-optimistic";

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
  if (!skill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,720px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit skill</DialogTitle>
        </DialogHeader>

        <EditSkillForm
          key={skill._id}
          skill={skill}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface EditSkillFormProps {
  skill: Doc<"skills">;
  onClose: () => void;
}

function EditSkillForm({ skill, onClose }: EditSkillFormProps) {
  const updateSkill = useMutation(api.skills.updateSkill).withOptimisticUpdate(
    (localStore, args) => {
      patchSkillInLists(localStore, args);
    },
  );

  const form = useForm<SkillFormValues>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: skillFormValuesFrom(skill),
  });

  const submitting = form.formState.isSubmitting;

  const onSubmit = async (values: SkillFormValues) => {
    try {
      await updateSkill({
        id: skill._id,
        name: values.name,
        description: values.description.trim(),
        instructions: values.instructions,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update skill";
      toast.error(msg);
    }
  };

  return (
    <SkillFormShell
      register={form.register}
      onSubmit={form.handleSubmit(onSubmit, toastSkillFormErrors)}
      onCancel={onClose}
      submitting={submitting}
      submitLabel="Done"
      nameId="edit-skill-name"
      descriptionId="edit-skill-description"
      instructionsId="edit-skill-instructions"
      labeledSections
    />
  );
}
