import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@vmem/ui";
import { toast } from "sonner";
import { SkillFormShell } from "@/components/skills/SkillFormShell";
import {
  emptySkillFormValues,
  skillFormSchema,
  toastSkillFormErrors,
  type SkillFormValues,
} from "@/components/skills/skillForm";
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
  const createSkill = useMutation(api.skills.createSkill);

  const form = useForm<SkillFormValues>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: emptySkillFormValues,
  });

  const submitting = form.formState.isSubmitting;

  useEffect(() => {
    if (!open) {
      form.reset(emptySkillFormValues);
    }
  }, [open, form]);

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset(emptySkillFormValues);
    onOpenChange(next);
  };

  const onSubmit = async (values: SkillFormValues) => {
    try {
      const skillId = await createSkill({
        name: values.name,
        description: values.description.trim(),
        instructions: values.instructions,
        teamId,
      });
      toast.success(`Added ${values.name}`);
      form.reset(emptySkillFormValues);
      onOpenChange(false);
      onCreated(skillId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add skill";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Write skill</DialogTitle>
        </DialogHeader>

        <SkillFormShell
          register={form.register}
          onSubmit={form.handleSubmit(onSubmit, toastSkillFormErrors)}
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
