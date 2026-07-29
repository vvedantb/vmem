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

type ConnectorMenuAction = "sync" | "disconnect" | "delete-data";

interface ConnectorActionsMenuProps {
  connectorName: string;
  isSyncing: boolean;
  isBusy: boolean;
  // explicit menu items prefer this over boolean show* flags
  actions: ConnectorMenuAction[];
  onSync: () => void;
  onDisconnect: () => void;
  onDeleteData: () => void;
}

export default function ConnectorActionsMenu({
  connectorName,
  isSyncing,
  isBusy,
  actions,
  onSync,
  onDisconnect,
  onDeleteData,
}: ConnectorActionsMenuProps) {
  if (actions.length === 0) {
    return null;
  }

  const actionSet = new Set(actions);
  const showSync = actionSet.has("sync");
  const showDisconnect = actionSet.has("disconnect");
  const showDeleteData = actionSet.has("delete-data");
  const hasDestructive = showDisconnect || showDeleteData;

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
        {showSync ? (
          <DropdownMenuItem onSelect={onSync} disabled={isBusy}>
            <IconRefresh size={14} />
            {isSyncing ? "Syncing…" : "Sync now"}
          </DropdownMenuItem>
        ) : null}
        {showSync && hasDestructive ? <DropdownMenuSeparator /> : null}
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
