"use client";

import { Checkbox } from "@vmem/ui";
import type { FileItem } from "@/lib/file-types";
import FileListRow from "./FileListRow";
import InlineNewFolder from "./InlineNewFolder";

interface FileListViewProps {
  items: FileItem[];
  isCreatingFolder: boolean;
  isAllSelected: boolean;
  isSelected: (id: string) => boolean;
  onClick: (
    id: string,
    e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => void;
  onCheckbox: (id: string) => void;
  onSelectAll: () => void;
  onOpen: (item: FileItem) => void;
  onDownload: (item: FileItem) => void;
  onMoveTo: (item: FileItem) => void;
  onRename: (item: FileItem) => void;
  onDelete: (item: FileItem) => void;
  onNewFolderConfirm: (name: string) => void;
  onNewFolderCancel: () => void;
}

export default function FileListView({
  items,
  isCreatingFolder,
  isAllSelected,
  isSelected,
  onClick,
  onCheckbox,
  onSelectAll,
  onOpen,
  onDownload,
  onMoveTo,
  onRename,
  onDelete,
  onNewFolderConfirm,
  onNewFolderCancel,
}: FileListViewProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-separator text-left">
            <th className="w-10 px-3 py-2">
              <Checkbox checked={isAllSelected} onCheckedChange={onSelectAll} />
            </th>
            <th className="py-2 pr-3 text-xs font-medium text-muted uppercase tracking-wider">
              Name
            </th>
            <th className="hidden md:table-cell py-2 pr-3 text-xs font-medium text-muted uppercase tracking-wider">
              Size
            </th>
            <th className="hidden md:table-cell py-2 pr-3 text-xs font-medium text-muted uppercase tracking-wider">
              Modified
            </th>
            <th className="w-10 py-2 pr-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {isCreatingFolder && (
            <InlineNewFolder
              variant="list"
              onConfirm={onNewFolderConfirm}
              onCancel={onNewFolderCancel}
            />
          )}
          {items.map((item) => (
            <FileListRow
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
        </tbody>
      </table>
    </div>
  );
}
