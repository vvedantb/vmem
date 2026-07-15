import type { FormEvent, ReactNode } from "react";
import type { UseFormRegister } from "react-hook-form";
import { Button, Input, Textarea } from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import {
  SkillDescriptionSection,
  SkillInstructionsSection,
} from "@/components/skills/SkillPanelSections";
import type { SkillFormValues } from "@/components/skills/skillForm";

type SkillFormShellProps = {
  register: UseFormRegister<SkillFormValues>;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
  nameId?: string;
  descriptionId?: string;
  instructionsId?: string;
  instructionsPlaceholder?: string;
  /** Wrap description/instructions with section labels (edit dialog). */
  labeledSections?: boolean;
  afterName?: ReactNode;
  beforeFooter?: ReactNode;
};

export function SkillFormShell({
  register,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  nameId,
  descriptionId,
  instructionsId,
  instructionsPlaceholder = "Instructions",
  labeledSections = false,
  afterName,
  beforeFooter,
}: SkillFormShellProps) {
  const descriptionField = (
    <Textarea
      id={descriptionId}
      placeholder="What this skill is for"
      aria-label="Description"
      rows={3}
      className="min-h-[4.5rem] resize-y"
      {...register("description")}
    />
  );

  const instructionsField = (
    <Textarea
      id={instructionsId}
      placeholder={instructionsPlaceholder}
      aria-label="Instructions"
      className="min-h-[240px] font-mono text-xs"
      {...register("instructions")}
    />
  );

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
    >
      <Input
        id={nameId}
        placeholder="Name"
        aria-label="Name"
        autoFocus
        {...register("name")}
      />
      {afterName}
      {labeledSections ? (
        <SkillDescriptionSection>{descriptionField}</SkillDescriptionSection>
      ) : (
        descriptionField
      )}
      {labeledSections ? (
        <SkillInstructionsSection>{instructionsField}</SkillInstructionsSection>
      ) : (
        instructionsField
      )}
      {beforeFooter}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? (
            <IconLoader2 size={14} className="animate-spin" />
          ) : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
