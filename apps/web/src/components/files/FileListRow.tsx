"use client";

import { useCallback } from "react";
import {
  Checkbox,
  cn,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@vmem/ui";
import {
  IconDotsVertical,
  IconFolderOpen,
  IconDownload,
  IconFolderSymlink,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import type { FileItem } from "@/lib/file-types";
import { formatFileSize, formatDate, getFileIcon } from "./_utils";
import FileContextMenu from "./FileContextMenu";
import MemoryIndexBadge from "./MemoryIndexBadge";

interface FileListRowProps {
  item: FileItem;
  isSelected: boolean;
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
}

export default function FileListRow({
  item,
  isSelected,
  onClick,
  onCheckbox,
  onOpen,
  onDownload,
  onMoveTo,
  onRename,
  onDelete,
}: FileListRowProps) {
  const FileIcon = getFileIcon(item.fileCategory);
  const isFolder = item.itemType === "folder";

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(item.id, e);
    },
    [item.id, onClick],
  );

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCheckbox(item.id);
    },
    [item.id, onCheckbox],
  );

  const handleRowOpen = useCallback(() => {
    onOpen(item);
  }, [item, onOpen]);

  return (
    <FileContextMenu
      item={item}
      onOpen={handleRowOpen}
      onDownload={() => onDownload(item)}
      onMoveTo={() => onMoveTo(item)}
      onRename={() => onRename(item)}
      onDelete={() => onDelete(item)}
    >
      <tr
        className={cn(
          "group cursor-pointer border-b border-separator transition-colors hover:bg-surface-tertiary/50",
          isSelected && "bg-accent/5",
        )}
        onClick={handleClick}
        onDoubleClick={handleRowOpen}
      >
        {/* Checkbox */}
        <td className="w-10 px-3 py-2">
          <div onClick={handleCheckboxClick}>
            <Checkbox checked={isSelected} tabIndex={-1} />
          </div>
        </td>

        {/* Icon + Name */}
        <td className="py-2 pr-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary overflow-hidden">
              {!isFolder &&
              item.fileCategory === "image" &&
              item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnailUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <FileIcon size={18} stroke={1.5} className="text-muted" />
              )}
            </div>
            <span className="text-sm font-medium text-foreground truncate">
              {item.name}
            </span>
            <MemoryIndexBadge item={item} />
          </div>
        </td>

        {/* Size */}
        <td className="hidden md:table-cell py-2 pr-3">
          <span className="text-sm text-muted tabular-nums">
            {isFolder
              ? `${item.itemCount ?? 0} items`
              : formatFileSize(item.size)}
          </span>
        </td>

        {/* Date */}
        <td className="hidden md:table-cell py-2 pr-3">
          <span className="text-sm text-muted">
            {formatDate(item.uploadedAt)}
          </span>
        </td>

        {/* Actions */}
        <td className="w-10 py-2 pr-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <IconDotsVertical size={16} stroke={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleRowOpen}>
                <IconFolderOpen size={16} stroke={1.5} />
                Open
              </DropdownMenuItem>
              {!isFolder && (
                <DropdownMenuItem onClick={() => onDownload(item)}>
                  <IconDownload size={16} stroke={1.5} />
                  Download
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onMoveTo(item)}>
                <IconFolderSymlink size={16} stroke={1.5} />
                Move to…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRename(item)}>
                <IconPencil size={16} stroke={1.5} />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-danger focus:text-danger"
                onClick={() => onDelete(item)}
              >
                <IconTrash size={16} stroke={1.5} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
    </FileContextMenu>
  );
}
