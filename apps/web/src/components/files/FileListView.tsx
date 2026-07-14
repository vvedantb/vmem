"use client";

import {
  Checkbox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from "@vmem/ui";
import type { FileItem } from "@/lib/file-types";
import FileListRow from "./FileListRow";
import { InlineNewFolderList } from "./InlineNewFolder";

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
    <Table className="rounded-none">
      <TableHeader>
        <TableRow className="border-b border-separator hover:bg-transparent">
          <TableHead className="w-10 px-3 py-2">
            <Checkbox checked={isAllSelected} onCheckedChange={onSelectAll} />
          </TableHead>
          <TableHead className="py-2 pr-3 text-xs font-medium uppercase tracking-wider text-muted">
            Name
          </TableHead>
          <TableHead className="hidden py-2 pr-3 text-xs font-medium uppercase tracking-wider text-muted md:table-cell">
            Size
          </TableHead>
          <TableHead className="hidden py-2 pr-3 text-xs font-medium uppercase tracking-wider text-muted md:table-cell">
            Modified
          </TableHead>
          <TableHead className="w-10 py-2 pr-3">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isCreatingFolder ? (
          <InlineNewFolderList
            onConfirm={onNewFolderConfirm}
            onCancel={onNewFolderCancel}
          />
        ) : null}
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
      </TableBody>
    </Table>
  );
}
