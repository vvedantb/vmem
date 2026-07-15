import type { FieldErrors } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

// shared create/edit skill fields — name + instructions required (trimmed)
export const skillFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string(),
  instructions: z
    .string()
    .refine((value) => value.trim().length > 0, "Instructions are required"),
});

export const systemSkillFormSchema = skillFormSchema.extend({
  category: z.string(),
  published: z.boolean(),
});

export type SkillFormValues = z.infer<typeof skillFormSchema>;
export type SystemSkillFormValues = z.infer<typeof systemSkillFormSchema>;

export const emptySkillFormValues: SkillFormValues = {
  name: "",
  description: "",
  instructions: "",
};

export const emptySystemSkillFormValues: SystemSkillFormValues = {
  ...emptySkillFormValues,
  category: "",
  published: false,
};

export function skillFormValuesFrom(fields: {
  name: string;
  description: string;
  instructions: string;
}): SkillFormValues {
  return {
    name: fields.name,
    description: fields.description,
    instructions: fields.instructions,
  };
}

export function systemSkillFormValuesFrom(fields: {
  name: string;
  description: string;
  instructions: string;
  category?: string;
  published: boolean;
}): SystemSkillFormValues {
  return {
    name: fields.name,
    description: fields.description,
    instructions: fields.instructions,
    category: fields.category ?? "",
    published: fields.published,
  };
}

// preserve toast validation UX from the pre-RHF dialogs
export function toastSkillFormErrors(
  errors: FieldErrors<SkillFormValues | SystemSkillFormValues>,
): void {
  if (errors.name?.message !== undefined) {
    toast.error(errors.name.message);
    return;
  }
  if (errors.instructions?.message !== undefined) {
    toast.error(errors.instructions.message);
  }
}
