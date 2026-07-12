"use client";

import { useCallback } from "react";
import { Checkbox, cn } from "@vmem/ui";
import type { FileItem } from "@/lib/file-types";
import { formatFileSize, getFileIcon } from "./_utils";
import FileContextMenu from "./FileContextMenu";
import MemoryIndexBadge from "./MemoryIndexBadge";

interface FileGridItemProps {
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

export default function FileGridItem({
  item,
  isSelected,
  onClick,
  onCheckbox,
  onOpen,
  onDownload,
  onMoveTo,
  onRename,
  onDelete,
}: FileGridItemProps) {
  const FileIcon = getFileIcon(item.fileCategory);
  const isFolder = item.itemType === "folder";

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(item.id, e);
    },
    [item.id, onClick],
  );

  const handleDoubleClick = useCallback(() => {
    onOpen(item);
  }, [item, onOpen]);

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCheckbox(item.id);
    },
    [item.id, onCheckbox],
  );

  return (
    <FileContextMenu
      item={item}
      onOpen={() => onOpen(item)}
      onDownload={() => onDownload(item)}
      onMoveTo={() => onMoveTo(item)}
      onRename={() => onRename(item)}
      onDelete={() => onDelete(item)}
    >
      <div
        className={cn(
          "group relative flex flex-col items-center gap-2 rounded-lg border p-3 cursor-pointer transition-[background-color,box-shadow,transform]",
          "hover:bg-surface-tertiary/50",
          isSelected
            ? "border-accent/50 bg-accent/5 ring-1 ring-accent/30"
            : "border-transparent",
        )}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Checkbox overlay — visible on hover or when selected */}
        <div
          className={cn(
            "absolute left-2 top-2 z-10 transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          onClick={handleCheckboxClick}
        >
          <Checkbox checked={isSelected} tabIndex={-1} />
        </div>

        {/* Icon / thumbnail area */}
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface-secondary overflow-hidden">
          {item.itemType === "file" &&
          item.fileCategory === "image" &&
          item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
              alt={item.name}
              className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-separator"
            />
          ) : (
            <FileIcon
              size={isFolder ? 48 : 40}
              stroke={1.2}
              className="text-muted"
            />
          )}
        </div>

        {/* Name + size */}
        <div className="w-full text-center min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {item.name}
          </p>
          {!isFolder && (
            <p className="text-xs text-muted">{formatFileSize(item.size)}</p>
          )}
          {!isFolder &&
            (item.indexStatus === "indexed" ||
              item.indexStatus === "failed") && (
              <div className="mt-1 flex justify-center">
                <MemoryIndexBadge item={item} />
              </div>
            )}
          {isFolder && item.itemCount !== undefined && (
            <p className="text-xs text-muted">
              {item.itemCount} {item.itemCount === 1 ? "item" : "items"}
            </p>
          )}
        </div>
      </div>
    </FileContextMenu>
  );
}
