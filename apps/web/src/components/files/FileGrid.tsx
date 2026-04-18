import type { FileItem } from "@/lib/file-types";
import FileGridItem from "./FileGridItem";
import InlineNewFolder from "./InlineNewFolder";

interface FileGridProps {
  items: FileItem[];
  isCreatingFolder: boolean;
  isSelected: (id: string) => boolean;
  onClick: (
    id: string,
    e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => void;
  onCheckbox: (id: string) => void;
  onOpen: (item: FileItem) => void;
  onDownload: (item: FileItem) => void;
  onMoveTo: (item: FileItem) => void;
  onRename: (item: FileItem) => void;
  onDelete: (item: FileItem) => void;
  onNewFolderConfirm: (name: string) => void;
  onNewFolderCancel: () => void;
}

export default function FileGrid({
  items,
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
      {isCreatingFolder && (
        <InlineNewFolder
          variant="grid"
          onConfirm={onNewFolderConfirm}
          onCancel={onNewFolderCancel}
        />
      )}
      {items.map((item) => (
        <FileGridItem
          key={item.id}
          item={item}
          isSelected={isSelected(item.id)}
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
