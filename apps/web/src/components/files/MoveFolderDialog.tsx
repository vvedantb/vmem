import { useState } from "react";
import type { Id } from "@vmem/backend";
import { Button, ConfirmDialog, cn } from "@vvedantb/ui";
import { IconFolder, IconFolderSymlink, IconHome } from "@tabler/icons-react";
import type { FileTreeNode } from "./-types";

interface MoveFolderDialogProps {
  isOpen: boolean;
  folders: FileTreeNode[];
  currentFolderId: Id<"fileNodes"> | null;
  itemCount: number;
  onMove: (targetFolderId: Id<"fileNodes"> | null) => void;
  onClose: () => void;
}

export default function MoveFolderDialog({
  isOpen,
  folders,
  currentFolderId,
  itemCount,
  onMove,
  onClose,
}: MoveFolderDialogProps) {
  const [selectedTarget, setSelectedTarget] = useState<Id<"fileNodes"> | null>(
    null,
  );

  const handleConfirm = () => {
    onMove(selectedTarget);
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const destinations = folders.filter(
    (folder) => folder._id !== currentFolderId,
  );

  return (
    <ConfirmDialog.Root
      alert={false}
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      <ConfirmDialog.Content className="max-w-sm" hideCloseButton>
        <ConfirmDialog.Header className="border-b border-separator pb-4">
          <ConfirmDialog.Title className="flex items-center gap-2 text-foreground">
            <IconFolderSymlink size={18} stroke={1.5} />
            Move {itemCount} {itemCount === 1 ? "item" : "items"}
          </ConfirmDialog.Title>
        </ConfirmDialog.Header>

        <ConfirmDialog.Body className="py-2 max-h-64 overflow-y-auto space-y-1">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "flex h-auto w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              selectedTarget === null
                ? "bg-accent/10 text-accent"
                : "text-foreground hover:bg-surface-tertiary",
            )}
            onClick={() => setSelectedTarget(null)}
          >
            <IconHome size={18} stroke={1.5} />
            Files (root)
          </Button>

          {destinations.map((folder) => (
            <Button
              key={folder._id}
              type="button"
              variant="ghost"
              className={cn(
                "flex h-auto w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                selectedTarget === folder._id
                  ? "bg-accent/10 text-accent"
                  : "text-foreground hover:bg-surface-tertiary",
              )}
              onClick={() => setSelectedTarget(folder._id)}
            >
              <IconFolder size={18} stroke={1.5} />
              {folder.name}
            </Button>
          ))}

          {destinations.length === 0 && (
            <p className="text-sm text-muted text-center py-4">
              No other folders available
            </p>
          )}
        </ConfirmDialog.Body>

        <ConfirmDialog.Footer className="border-t border-separator pt-4">
          <ConfirmDialog.Cancel className="text-muted" />
          <ConfirmDialog.Action onClick={handleConfirm}>
            Move here
          </ConfirmDialog.Action>
        </ConfirmDialog.Footer>
      </ConfirmDialog.Content>
    </ConfirmDialog.Root>
  );
}
