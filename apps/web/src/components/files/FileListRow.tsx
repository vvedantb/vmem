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
import { IconDotsVertical } from "@tabler/icons-react";
import {
  formatFileSize,
  formatDate,
  formatItemCount,
  getFileIcon,
  imageThumbnailUrl,
  type FileItemChromeProps,
} from "./_utils";
import { fileItemActions } from "./fileItemActions";
import FileContextMenu from "./FileContextMenu";
import MemoryIndexBadge from "./MemoryIndexBadge";

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
}: FileItemChromeProps) {
  const FileIcon = getFileIcon(item.fileCategory);
  const isFolder = item.itemType === "folder";
  const thumbnailUrl = imageThumbnailUrl(item);
  const actions = fileItemActions(item, {
    onOpen: () => onOpen(item),
    onDownload: () => onDownload(item),
    onMoveTo: () => onMoveTo(item),
    onRename: () => onRename(item),
    onDelete: () => onDelete(item),
  });

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
        <td className="w-10 px-3 py-2">
          <div onClick={handleCheckboxClick}>
            <Checkbox checked={isSelected} tabIndex={-1} />
          </div>
        </td>

        <td className="py-2 pr-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary overflow-hidden">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={item.name}
                  className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-separator"
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

        <td className="hidden md:table-cell py-2 pr-3">
          <span className="text-sm text-muted tabular-nums">
            {isFolder
              ? formatItemCount(item.itemCount ?? 0)
              : formatFileSize(item.size)}
          </span>
        </td>

        <td className="hidden md:table-cell py-2 pr-3">
          <span className="text-sm text-muted">
            {formatDate(item.uploadedAt)}
          </span>
        </td>

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
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.key}
                  className={
                    action.danger
                      ? "text-danger focus:text-danger data-[highlighted]:text-danger"
                      : undefined
                  }
                  onClick={action.onClick}
                >
                  <action.Icon size={16} stroke={1.5} />
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
    </FileContextMenu>
  );
}
