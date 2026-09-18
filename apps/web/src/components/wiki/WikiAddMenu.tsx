import { IconCode, IconFileText, IconFolderPlus } from "@tabler/icons-react";
import { DropdownMenuItem } from "@vmem/ui";
import { FeatureAddMenu } from "@/components/shell/FeatureAddMenu";

interface WikiAddMenuProps {
  onCreateDocument: () => void;
  onCreateArtifact: () => void;
  onCreateFolder: () => void;
}

export function WikiAddMenu({
  onCreateDocument,
  onCreateArtifact,
  onCreateFolder,
}: WikiAddMenuProps) {
  return (
    <FeatureAddMenu>
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
