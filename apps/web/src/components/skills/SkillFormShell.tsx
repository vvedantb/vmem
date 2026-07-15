"use client";

import type { FormEvent, ReactNode } from "react";
import { Button, Input, Textarea } from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import {
  SkillDescriptionSection,
  SkillInstructionsSection,
} from "@/components/skills/SkillPanelSections";

type SkillFormShellProps = {
  name: string;
  description: string;
  instructions: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onInstructionsChange: (value: string) => void;
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
  name,
  description,
  instructions,
  onNameChange,
  onDescriptionChange,
  onInstructionsChange,
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
      value={description}
      onChange={(e) => onDescriptionChange(e.target.value)}
      placeholder="What this skill is for"
      aria-label="Description"
      rows={3}
      className="min-h-[4.5rem] resize-y"
    />
  );

  const instructionsField = (
    <Textarea
      id={instructionsId}
      value={instructions}
      onChange={(e) => onInstructionsChange(e.target.value)}
      placeholder={instructionsPlaceholder}
      aria-label="Instructions"
      className="min-h-[240px] font-mono text-xs"
    />
  );

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
    >
      <Input
        id={nameId}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Name"
        aria-label="Name"
        autoFocus
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
