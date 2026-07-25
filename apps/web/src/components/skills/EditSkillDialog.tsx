import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@vmem/ui";
import { toast } from "sonner";
import { SkillFormShell } from "@/components/skills/SkillFormShell";
import {
  emptySkillFormValues,
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
  const updateSkill = useMutation(api.skills.updateSkill).withOptimisticUpdate(
    (localStore, args) => {
      patchSkillInLists(localStore, args);
    },
  );

  const form = useForm<SkillFormValues>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: emptySkillFormValues,
  });

  const submitting = form.formState.isSubmitting;
  const skillId = skill?._id;

  useEffect(() => {
    if (!open || !skill) return;
    form.reset(skillFormValuesFrom(skill));
    // Reset only when the dialog opens or the edited skill changes — not on
    // every live-query identity churn while the form is dirty.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- skill snapshot at open/_id
  }, [open, skillId, form]);

  const onSubmit = async (values: SkillFormValues) => {
    if (!skill) return;

    try {
      await updateSkill({
        id: skill._id,
        name: values.name,
        description: values.description.trim(),
        instructions: values.instructions,
      });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update skill";
      toast.error(msg);
    }
  };

  if (!skill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit skill</DialogTitle>
        </DialogHeader>

        <SkillFormShell
          register={form.register}
          onSubmit={form.handleSubmit(onSubmit, toastSkillFormErrors)}
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
