import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@vmem/ui";
import type { FileNodeAction } from "./fileItemActions";

interface FileContextMenuProps {
  actions: FileNodeAction[];
  children: ReactNode;
}

export default function FileContextMenu({
  actions,
  children,
}: FileContextMenuProps) {
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
