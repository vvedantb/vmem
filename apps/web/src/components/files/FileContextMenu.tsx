import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@vmem/ui";
import type { FileTreeNode } from "./-types";
import {
  fileNodeActions,
  type FileNodeActionHandlers,
} from "./fileItemActions";

interface FileContextMenuProps extends FileNodeActionHandlers {
  node: FileTreeNode;
  children: ReactNode;
}

export default function FileContextMenu({
  node,
  onOpen,
  onDownload,
  onMoveTo,
  onRename,
  onDelete,
  children,
}: FileContextMenuProps) {
  const actions = fileNodeActions(node, {
    onOpen,
    onDownload,
    onMoveTo,
    onRename,
    onDelete,
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map((action) => (
          <Fragment key={action.key}>
            {action.separatorBefore ? <ContextMenuSeparator /> : null}
            <ContextMenuItem
              className={
                action.danger
                  ? "text-danger focus:text-danger data-[highlighted]:text-danger"
                  : undefined
              }
              onClick={action.onClick}
            >
              <action.Icon size={16} stroke={1.5} />
              {action.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
