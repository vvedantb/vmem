import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@vmem/ui";
import type { FileItem } from "./-types";
import {
  fileItemActions,
  type FileItemActionHandlers,
} from "./fileItemActions";

interface FileContextMenuProps extends FileItemActionHandlers {
  item: FileItem;
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
  const actions = fileItemActions(item, {
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
