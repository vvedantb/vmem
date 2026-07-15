import { IconPencil, IconUpload } from "@tabler/icons-react";
import { DropdownMenuItem } from "@vmem/ui";
import { FeatureAddMenu } from "@/components/shell/FeatureAddMenu";

interface SkillsAddMenuProps {
  onWriteSkill: () => void;
  onUploadSkill: () => void;
  // `toolbar` = icon-only for the sidebar chrome row; `labeled` = full Add button
  variant?: "toolbar" | "labeled";
  className?: string;
}

export function SkillsAddMenu({
  onWriteSkill,
  onUploadSkill,
  variant = "labeled",
  className,
}: SkillsAddMenuProps) {
  return (
    <FeatureAddMenu variant={variant} className={className}>
      <DropdownMenuItem onSelect={onWriteSkill}>
        <IconPencil size={16} />
        Write skill
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onUploadSkill}>
        <IconUpload size={16} />
        Upload skill
      </DropdownMenuItem>
    </FeatureAddMenu>
  );
}
