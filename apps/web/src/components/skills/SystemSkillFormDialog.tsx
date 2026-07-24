import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
} from "@vmem/ui";
import { toast } from "sonner";
import { type SystemSkillEntry } from "@/components/skills/_utils";
import { SkillFormShell } from "@/components/skills/SkillFormShell";
import {
  emptySystemSkillFormValues,
  systemSkillFormSchema,
  systemSkillFormValuesFrom,
  toastSkillFormErrors,
  type SystemSkillFormValues,
} from "@/components/skills/skillForm";
import { tempId, updateAllCachedQueries } from "@/lib/convex-optimistic";

interface SystemSkillFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // undefined = create a new catalogue skill; provided = edit it
  entry?: SystemSkillEntry;
}

// admin-only create/edit form for a catalogue system skill
export function SystemSkillFormDialog({
  open,
  onOpenChange,
  entry,
}: SystemSkillFormDialogProps) {
  const adminCreate = useMutation(
    api.systemSkills.adminCreate,
  ).withOptimisticUpdate((localStore, args) => {
    const now = Date.now();
    const newId = tempId<"systemSkills">();
    updateAllCachedQueries(localStore, api.systemSkills.listCatalog, (list) => [
      {
        _id: newId,
        name: args.name,
        description: args.description,
        instructions: args.instructions,
        category: args.category,
        published: args.published,
        updatedAt: now,
        installed: false,
        installEnabled: false,
      },
      ...list,
    ]);
  });
  const adminUpdate = useMutation(
    api.systemSkills.adminUpdate,
  ).withOptimisticUpdate((localStore, args) => {
    updateAllCachedQueries(localStore, api.systemSkills.listCatalog, (list) =>
      list.map((s) =>
        s._id === args.id
          ? {
              ...s,
              ...(args.name !== undefined ? { name: args.name } : {}),
              ...(args.description !== undefined
                ? { description: args.description }
                : {}),
              ...(args.instructions !== undefined
                ? { instructions: args.instructions }
                : {}),
              ...(args.category !== undefined
                ? {
                    category:
                      args.category === null ? undefined : args.category,
                  }
                : {}),
              ...(args.published !== undefined
                ? { published: args.published }
                : {}),
              updatedAt: Date.now(),
            }
          : s,
      ),
    );
  });

  const isEdit = entry !== undefined;

  const form = useForm<SystemSkillFormValues>({
    resolver: zodResolver(systemSkillFormSchema),
    defaultValues: emptySystemSkillFormValues,
  });

  const submitting = form.formState.isSubmitting;
  const entryId = entry?._id;

  useEffect(() => {
    if (!open) {
      form.reset(emptySystemSkillFormValues);
      return;
    }
    if (entry !== undefined) {
      form.reset(systemSkillFormValuesFrom(entry));
      return;
    }
    form.reset(emptySystemSkillFormValues);
    // Reset on open / entry identity only — not on live-query object churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry snapshot at open/_id
  }, [open, entryId, form]);

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset(emptySystemSkillFormValues);
    onOpenChange(next);
  };

  const onSubmit = async (values: SystemSkillFormValues) => {
    const trimmedCategory = values.category.trim();
    const category = trimmedCategory.length > 0 ? trimmedCategory : undefined;

    try {
      if (entry !== undefined) {
        await adminUpdate({
          id: entry._id,
          name: values.name,
          description: values.description.trim(),
          instructions: values.instructions,
          category: category ?? null,
          published: values.published,
        });
        onOpenChange(false);
        return;
      }

      await adminCreate({
        name: values.name,
        description: values.description.trim(),
        instructions: values.instructions,
        category,
        published: values.published,
      });
      toast.success(`Created ${values.name}`);
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,760px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit system skill" : "New system skill"}
          </DialogTitle>
        </DialogHeader>

        <SkillFormShell
          register={form.register}
          onSubmit={form.handleSubmit(onSubmit, toastSkillFormErrors)}
          onCancel={() => handleOpenChange(false)}
          submitting={submitting}
          submitLabel={isEdit ? "Done" : "Create"}
          instructionsPlaceholder="Instructions (markdown playbook the agent follows)"
          afterName={
            <Input
              placeholder="Category (optional, e.g. Codebases)"
              aria-label="Category"
              {...form.register("category")}
            />
          }
          beforeFooter={
            <div className="flex items-center gap-2">
              <Controller
                control={form.control}
                name="published"
                render={({ field }) => (
                  <Switch
                    id="system-skill-published"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="system-skill-published" className="text-sm">
                Published (visible in the Hub)
              </Label>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
