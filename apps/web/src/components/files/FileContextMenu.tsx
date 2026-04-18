import { type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@vmem/ui";
import {
  IconFolderOpen,
  IconDownload,
  IconFolderSymlink,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import type { FileItem } from "@/lib/file-types";

interface FileContextMenuProps {
  item: FileItem;
  onOpen: () => void;
  onDownload: () => void;
  onMoveTo: () => void;
  onRename: () => void;
  onDelete: () => void;
  children: ReactNode;
}

export default function FileContextMenu({
  item,
  onOpen,
  onDownload,
  onMoveTo,
  onRename,
  onDelete,
  children,
}: FileContextMenuProps) {
  const isFolder = item.itemType === "folder";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>
          <IconFolderOpen size={16} stroke={1.5} />
          Open
        </ContextMenuItem>
        {!isFolder && (
          <ContextMenuItem onClick={onDownload}>
            <IconDownload size={16} stroke={1.5} />
            Download
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={onMoveTo}>
          <IconFolderSymlink size={16} stroke={1.5} />
          Move to…
        </ContextMenuItem>
        {isFolder && (
          <ContextMenuItem onClick={onRename}>
            <IconPencil size={16} stroke={1.5} />
            Rename
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          <IconTrash size={16} stroke={1.5} />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
