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
  isSyncing: boolean;
  isBusy: boolean;
  showSyncActions: boolean;
  showDisconnect: boolean;
  showDeleteData: boolean;
  onSync: () => void;
  onDisconnect: () => void;
  onDeleteData: () => void;
}

export default function ConnectorActionsMenu({
  connectorName,
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
          variant="secondary"
          size="sm"
          disabled={isBusy}
          aria-label={`${connectorName} options`}
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
          <DropdownMenuItem onSelect={onSync} disabled={isBusy}>
            <IconRefresh size={14} />
            {isSyncing ? "Syncing…" : "Sync now"}
          </DropdownMenuItem>
        ) : null}
        {showSyncActions && hasDestructive ? <DropdownMenuSeparator /> : null}
        {showDisconnect ? (
          <DropdownMenuItem
            className="text-danger focus:text-danger data-[highlighted]:text-danger"
            onSelect={onDisconnect}
            disabled={isBusy}
          >
            <IconUnlink size={14} />
            Disconnect
          </DropdownMenuItem>
        ) : null}
        {showDeleteData ? (
          <DropdownMenuItem
            className="text-danger focus:text-danger data-[highlighted]:text-danger"
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
