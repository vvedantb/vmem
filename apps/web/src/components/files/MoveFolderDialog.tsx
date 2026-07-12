"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  cn,
} from "@vmem/ui";
import { IconFolder, IconFolderSymlink, IconHome } from "@tabler/icons-react";
import type { FileItem } from "@/lib/file-types";

interface MoveFolderDialogProps {
  isOpen: boolean;
  folders: FileItem[];
  currentFolderId: string | null;
  itemCount: number;
  onMove: (targetFolderId: string | null) => void;
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
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const handleConfirm = useCallback(() => {
    onMove(selectedTarget);
    onClose();
  }, [selectedTarget, onMove, onClose]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  // Filter out the current folder from destinations
  const destinations = folders.filter((f) => f.id !== currentFolderId);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm" hideCloseButton>
        <DialogHeader className="border-b border-separator pb-4">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <IconFolderSymlink size={18} stroke={1.5} />
            Move {itemCount} {itemCount === 1 ? "item" : "items"}
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 max-h-64 overflow-y-auto space-y-1">
          {/* Root option */}
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

          {/* Folder list */}
          {destinations.map((folder) => (
            <Button
              key={folder.id}
              type="button"
              variant="ghost"
              className={cn(
                "flex h-auto w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                selectedTarget === folder.id
                  ? "bg-accent/10 text-accent"
                  : "text-foreground hover:bg-surface-tertiary",
              )}
              onClick={() => setSelectedTarget(folder.id)}
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
        </div>

        <DialogFooter className="border-t border-separator pt-4">
          <Button variant="ghost" onClick={onClose} className="text-muted">
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Move here</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
