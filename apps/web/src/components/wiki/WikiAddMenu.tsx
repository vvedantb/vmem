import { IconCode, IconFileText, IconFolderPlus } from "@tabler/icons-react";
import { DropdownMenuItem } from "@vmem/ui";
import { FeatureAddMenu } from "@/components/shell/FeatureAddMenu";

interface WikiAddMenuProps {
  onCreateDocument: () => void;
  onCreateArtifact: () => void;
  onCreateFolder: () => void;
  // `toolbar` = icon-only for the sidebar chrome row; `labeled` = full Add button
  variant?: "toolbar" | "labeled";
  className?: string;
}

export function WikiAddMenu({
  onCreateDocument,
  onCreateArtifact,
  onCreateFolder,
  variant = "labeled",
  className,
}: WikiAddMenuProps) {
  return (
    <FeatureAddMenu variant={variant} className={className}>
      <DropdownMenuItem onSelect={onCreateDocument}>
        <IconFileText size={16} />
        New document
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onCreateArtifact}>
        <IconCode size={16} />
        New artifact
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onCreateFolder}>
        <IconFolderPlus size={16} />
        New folder
      </DropdownMenuItem>
    </FeatureAddMenu>
  );
}
