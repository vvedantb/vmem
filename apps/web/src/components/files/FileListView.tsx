"use client";

import {
  Checkbox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from "@vmem/ui";
import type { Id } from "@vmem/backend";
import type { FileTreeNode } from "./-types";
import FileListRow from "./FileListRow";
import { InlineNewFolderList } from "./InlineNewFolder";

interface FileListViewProps {
  items: FileTreeNode[];
  childCounts: Map<Id<"fileNodes">, number>;
  isCreatingFolder: boolean;
  isAllSelected: boolean;
  isSelected: (id: Id<"fileNodes">) => boolean;
  onClick: (
    id: Id<"fileNodes">,
    e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => void;
  onCheckbox: (id: Id<"fileNodes">) => void;
  onSelectAll: () => void;
  onOpen: (node: FileTreeNode) => void;
  onDownload: (node: FileTreeNode) => void;
  onMoveTo: (node: FileTreeNode) => void;
  onRename: (node: FileTreeNode) => void;
  onDelete: (node: FileTreeNode) => void;
  onNewFolderConfirm: (name: string) => void;
  onNewFolderCancel: () => void;
}

export default function FileListView({
  items,
  childCounts,
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
        {items.map((node) => (
          <FileListRow
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
      </TableBody>
    </Table>
  );
}
