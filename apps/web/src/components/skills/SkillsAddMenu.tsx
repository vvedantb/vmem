"use client";

import { IconPencil, IconUpload } from "@tabler/icons-react";
import { DropdownMenuItem } from "@vmem/ui";
import { FeatureAddMenu } from "@/components/FeatureAddMenu";

interface SkillsAddMenuItemsProps {
  onWriteSkill: () => void;
  onUploadSkill: () => void;
}

function SkillsAddMenuItems({
  onWriteSkill,
  onUploadSkill,
}: SkillsAddMenuItemsProps) {
  return (
    <>
      <DropdownMenuItem onSelect={onWriteSkill}>
        <IconPencil size={16} />
        Write skill
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onUploadSkill}>
        <IconUpload size={16} />
        Upload skill
      </DropdownMenuItem>
    </>
  );
}

interface SkillsAddMenuActionProps {
  onWriteSkill: () => void;
  onUploadSkill: () => void;
  className?: string;
}

export function SkillsToolbarAddMenu({
  onWriteSkill,
  onUploadSkill,
  className,
}: SkillsAddMenuActionProps) {
  return (
    <FeatureAddMenu variant="toolbar" className={className}>
      <SkillsAddMenuItems
        onWriteSkill={onWriteSkill}
        onUploadSkill={onUploadSkill}
      />
    </FeatureAddMenu>
  );
}

export function SkillsLabeledAddMenu({
  onWriteSkill,
  onUploadSkill,
  className,
}: SkillsAddMenuActionProps) {
  return (
    <FeatureAddMenu variant="labeled" className={className}>
      <SkillsAddMenuItems
        onWriteSkill={onWriteSkill}
        onUploadSkill={onUploadSkill}
      />
    </FeatureAddMenu>
  );
}

interface SkillsAddMenuProps {
  onWriteSkill: () => void;
  onUploadSkill: () => void;
  variant?: "toolbar" | "labeled";
  className?: string;
}

export function SkillsAddMenu({
  onWriteSkill,
  onUploadSkill,
  variant = "labeled",
  className,
}: SkillsAddMenuProps) {
  if (variant === "toolbar") {
    return (
      <SkillsToolbarAddMenu
        onWriteSkill={onWriteSkill}
        onUploadSkill={onUploadSkill}
        className={className}
      />
    );
  }

  return (
    <SkillsLabeledAddMenu
      onWriteSkill={onWriteSkill}
      onUploadSkill={onUploadSkill}
      className={className}
    />
  );
}
