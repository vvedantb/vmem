import type { TablerIcon } from "@tabler/icons-react";
import {
  IconDownload,
  IconFolderOpen,
  IconFolderSymlink,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import type { FileTreeNode } from "./-types";

export type FileNodeActionHandlers = {
  onOpen: () => void;
  onDownload: () => void;
  onMoveTo: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export type FileNodeAction = {
  key: string;
  label: string;
  Icon: TablerIcon;
  onClick: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
};

type FileNodeActionSource = {
  onOpen: (node: FileTreeNode) => void;
  onDownload: (node: FileTreeNode) => void;
  onMoveTo: (node: FileTreeNode) => void;
  onRename: (node: FileTreeNode) => void;
  onDelete: (node: FileTreeNode) => void;
};

// bind chrome callbacks to a single node for menus
function bindFileNodeActionHandlers(
  node: FileTreeNode,
  source: FileNodeActionSource,
): FileNodeActionHandlers {
  return {
    onOpen: () => source.onOpen(node),
    onDownload: () => source.onDownload(node),
    onMoveTo: () => source.onMoveTo(node),
    onRename: () => source.onRename(node),
    onDelete: () => source.onDelete(node),
  };
}

// shared Open / Download / Move / Rename / Delete for context + row menus
function fileNodeActions(
  node: FileTreeNode,
  handlers: FileNodeActionHandlers,
): FileNodeAction[] {
  const actions: FileNodeAction[] = [
    {
      key: "open",
      label: "Open",
      Icon: IconFolderOpen,
      onClick: handlers.onOpen,
    },
  ];

  if (node.kind !== "folder") {
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

export function fileNodeActionsFor(
  node: FileTreeNode,
  source: FileNodeActionSource,
): { handlers: FileNodeActionHandlers; actions: FileNodeAction[] } {
  const handlers = bindFileNodeActionHandlers(node, source);
  return { handlers, actions: fileNodeActions(node, handlers) };
}
