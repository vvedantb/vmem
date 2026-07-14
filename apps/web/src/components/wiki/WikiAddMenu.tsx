"use client";

import { IconFileText, IconFolderPlus } from "@tabler/icons-react";
import { DropdownMenuItem } from "@vmem/ui";
import { FeatureAddMenu } from "@/components/_components/FeatureAddMenu";

interface WikiAddMenuProps {
  onCreateDocument: () => void;
  onCreateFolder: () => void;
  // `toolbar` = icon-only for the sidebar chrome row; `labeled` = full Add button
  variant?: "toolbar" | "labeled";
  className?: string;
}

export function WikiAddMenu({
  onCreateDocument,
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
      <DropdownMenuItem onSelect={onCreateFolder}>
        <IconFolderPlus size={16} />
        New folder
      </DropdownMenuItem>
    </FeatureAddMenu>
  );
}
