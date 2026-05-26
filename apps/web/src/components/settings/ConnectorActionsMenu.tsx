"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vmem/ui";
import {
  IconDots,
  IconLoader2,
  IconUnlink,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";

interface ConnectorActionsMenuProps {
  connectorName: string;
  isLinear: boolean;
  isSyncing: boolean;
  isBusy: boolean;
  showSyncActions: boolean;
  showDisconnect: boolean;
  showDeleteData: boolean;
  onSync: (fullHistory: boolean) => void;
  onDisconnect: () => void;
  onDeleteData: () => void;
}

export default function ConnectorActionsMenu({
  connectorName,
  isLinear,
  isSyncing,
  isBusy,
  showSyncActions,
  showDisconnect,
  showDeleteData,
  onSync,
  onDisconnect,
  onDeleteData,
}: ConnectorActionsMenuProps) {
  const hasDestructive = showDisconnect || showDeleteData;
  const hasMenuItems = showSyncActions || hasDestructive;

  if (!hasMenuItems) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isBusy}
          aria-label={`${connectorName} options`}
          className="text-muted"
        >
          {isSyncing ? (
            <IconLoader2 size={14} className="animate-spin" />
          ) : (
            <IconDots size={14} />
          )}
          Options
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {showSyncActions ? (
          isLinear ? (
            <>
              <DropdownMenuItem
                onSelect={() => onSync(false)}
                disabled={isBusy}
              >
                <IconRefresh size={14} />
                Sync recent (30d)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSync(true)} disabled={isBusy}>
                <IconRefresh size={14} />
                Sync all history
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => onSync(false)} disabled={isBusy}>
              <IconRefresh size={14} />
              {isSyncing ? "Syncing…" : "Sync now"}
            </DropdownMenuItem>
          )
        ) : null}
        {showSyncActions && hasDestructive ? <DropdownMenuSeparator /> : null}
        {showDisconnect ? (
          <DropdownMenuItem
            className="text-danger focus:text-danger"
            onSelect={onDisconnect}
            disabled={isBusy}
          >
            <IconUnlink size={14} />
            Disconnect
          </DropdownMenuItem>
        ) : null}
        {showDeleteData ? (
          <DropdownMenuItem
            className="text-danger focus:text-danger"
            onSelect={onDeleteData}
            disabled={isBusy}
          >
            <IconTrash size={14} />
            Delete imported data
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
