import { useCallback } from "react";
import { Checkbox, cn } from "@vmem/ui";
import {
  formatFileSize,
  formatItemCount,
  fileCategoryForNode,
  getFileIcon,
  imageThumbnailUrl,
  type FileNodeChromeProps,
} from "./_utils";
import { fileNodeActionsFor } from "./fileItemActions";
import FileContextMenu from "./FileContextMenu";
import MemoryIndexBadge from "./MemoryIndexBadge";

export default function FileGridItem({
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
  const { actions } = fileNodeActionsFor(node, {
    onOpen,
    onDownload,
    onMoveTo,
    onRename,
    onDelete,
  });

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(node._id, e);
    },
    [node._id, onClick],
  );

  const handleDoubleClick = useCallback(() => {
    onOpen(node);
  }, [node, onOpen]);

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCheckbox(node._id);
    },
    [node._id, onCheckbox],
  );

  return (
    <FileContextMenu actions={actions}>
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
              alt={node.name}
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
            {node.name}
          </p>
          {!isFolder && (
            <p className="text-xs text-muted">
              {formatFileSize(node.size ?? 0)}
            </p>
          )}
          <div className="mt-1 flex justify-center">
            <MemoryIndexBadge node={node} />
          </div>
          {isFolder && (
            <p className="text-xs text-muted">{formatItemCount(childCount)}</p>
          )}
        </div>
      </div>
    </FileContextMenu>
  );
}
