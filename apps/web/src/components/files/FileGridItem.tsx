"use client";

import { useCallback } from "react";
import { Checkbox, cn } from "@vmem/ui";
import {
  formatFileSize,
  formatItemCount,
  getFileIcon,
  imageThumbnailUrl,
  type FileItemChromeProps,
} from "./_utils";
import FileContextMenu from "./FileContextMenu";
import MemoryIndexBadge from "./MemoryIndexBadge";

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
}: FileItemChromeProps) {
  const FileIcon = getFileIcon(item.fileCategory);
  const isFolder = item.itemType === "folder";
  const thumbnailUrl = imageThumbnailUrl(item);

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
        <div
          className={cn(
            "absolute left-2 top-2 z-10 transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          onClick={handleCheckboxClick}
        >
          <Checkbox checked={isSelected} tabIndex={-1} />
        </div>

        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface-secondary overflow-hidden">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
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

        <div className="w-full text-center min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {item.name}
          </p>
          {!isFolder && (
            <p className="text-xs text-muted">{formatFileSize(item.size)}</p>
          )}
          <div className="mt-1 flex justify-center">
            <MemoryIndexBadge item={item} />
          </div>
          {isFolder && item.itemCount !== undefined && (
            <p className="text-xs text-muted">
              {formatItemCount(item.itemCount)}
            </p>
          )}
        </div>
      </div>
    </FileContextMenu>
  );
}
