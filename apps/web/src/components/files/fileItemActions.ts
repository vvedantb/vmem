import type { TablerIcon } from "@tabler/icons-react";
import {
  IconDownload,
  IconFolderOpen,
  IconFolderSymlink,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import type { FileItem } from "./-types";

export type FileItemActionHandlers = {
  onOpen: () => void;
  onDownload: () => void;
  onMoveTo: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export type FileItemAction = {
  key: string;
  label: string;
  Icon: TablerIcon;
  onClick: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
};

// shared Open / Download / Move / Rename / Delete for context + row menus
export function fileItemActions(
  item: FileItem,
  handlers: FileItemActionHandlers,
): FileItemAction[] {
  const actions: FileItemAction[] = [
    {
      key: "open",
      label: "Open",
      Icon: IconFolderOpen,
      onClick: handlers.onOpen,
    },
  ];

  if (item.itemType !== "folder") {
    actions.push({
      key: "download",
      label: "Download",
      Icon: IconDownload,
      onClick: handlers.onDownload,
    });
  }

  actions.push(
    {
      key: "move",
      label: "Move to…",
      Icon: IconFolderSymlink,
      onClick: handlers.onMoveTo,
    },
    {
      key: "rename",
      label: "Rename",
      Icon: IconPencil,
      onClick: handlers.onRename,
    },
    {
      key: "delete",
      label: "Delete",
      Icon: IconTrash,
      onClick: handlers.onDelete,
      danger: true,
      separatorBefore: true,
    },
  );

  return actions;
}
