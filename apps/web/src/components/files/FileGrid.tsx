import type { Id } from "@vmem/backend";
import type { FileTreeNode } from "./-types";
import FileGridItem from "./FileGridItem";
import { InlineNewFolderGrid } from "./InlineNewFolder";

interface FileGridProps {
  items: FileTreeNode[];
  childCounts: Map<Id<"fileNodes">, number>;
  isCreatingFolder: boolean;
  isSelected: (id: Id<"fileNodes">) => boolean;
  onClick: (
    id: Id<"fileNodes">,
    e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => void;
  onCheckbox: (id: Id<"fileNodes">) => void;
  onOpen: (node: FileTreeNode) => void;
  onDownload: (node: FileTreeNode) => void;
  onMoveTo: (node: FileTreeNode) => void;
  onRename: (node: FileTreeNode) => void;
  onDelete: (node: FileTreeNode) => void;
  onNewFolderConfirm: (name: string) => void;
  onNewFolderCancel: () => void;
}

export default function FileGrid({
  items,
  childCounts,
  isCreatingFolder,
  isSelected,
  onClick,
  onCheckbox,
  onOpen,
  onDownload,
  onMoveTo,
  onRename,
  onDelete,
  onNewFolderConfirm,
  onNewFolderCancel,
}: FileGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2">
      {isCreatingFolder ? (
        <InlineNewFolderGrid
          onConfirm={onNewFolderConfirm}
          onCancel={onNewFolderCancel}
        />
      ) : null}
      {items.map((node) => (
        <FileGridItem
          key={node._id}
          node={node}
          childCount={childCounts.get(node._id) ?? 0}
          isSelected={isSelected(node._id)}
          onClick={onClick}
          onCheckbox={onCheckbox}
          onOpen={onOpen}
          onDownload={onDownload}
          onMoveTo={onMoveTo}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
