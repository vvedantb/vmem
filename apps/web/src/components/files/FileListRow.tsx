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
  fileCategoryForNode,
  getFileIcon,
  imageThumbnailUrl,
  type FileNodeChromeProps,
} from "./_utils";
import { fileNodeActions } from "./fileItemActions";
import FileContextMenu from "./FileContextMenu";
import MemoryIndexBadge from "./MemoryIndexBadge";

export default function FileListRow({
  node,
  childCount,
  isSelected,
  onClick,
  onCheckbox,
  onOpen,
  onDownload,
  onMoveTo,
  onRename,
  onDelete,
}: FileNodeChromeProps) {
  const fileCategory = fileCategoryForNode(node);
  const FileIcon = getFileIcon(fileCategory);
  const isFolder = node.kind === "folder";
  const thumbnailUrl = imageThumbnailUrl(node);
  const actions = fileNodeActions(node, {
    onOpen: () => onOpen(node),
    onDownload: () => onDownload(node),
    onMoveTo: () => onMoveTo(node),
    onRename: () => onRename(node),
    onDelete: () => onDelete(node),
  });

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(node._id, e);
    },
    [node._id, onClick],
  );

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCheckbox(node._id);
    },
    [node._id, onCheckbox],
  );

  const handleRowOpen = useCallback(() => {
    onOpen(node);
  }, [node, onOpen]);

  return (
    <FileContextMenu
      node={node}
      onOpen={handleRowOpen}
      onDownload={() => onDownload(node)}
      onMoveTo={() => onMoveTo(node)}
      onRename={() => onRename(node)}
      onDelete={() => onDelete(node)}
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
                  alt={node.name}
                  className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-separator"
                />
              ) : (
                <FileIcon size={18} stroke={1.5} className="text-muted" />
              )}
            </div>
            <span className="text-sm font-medium text-foreground truncate">
              {node.name}
            </span>
            <MemoryIndexBadge node={node} />
          </div>
        </td>

        <td className="hidden md:table-cell py-2 pr-3">
          <span className="text-sm text-muted tabular-nums">
            {isFolder
              ? formatItemCount(childCount)
              : formatFileSize(node.size ?? 0)}
          </span>
        </td>

        <td className="hidden md:table-cell py-2 pr-3">
          <span className="text-sm text-muted">
            {formatDate(node.createdAt)}
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
