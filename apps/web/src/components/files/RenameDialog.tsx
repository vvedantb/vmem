"use client";

import { useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from "@vmem/ui";
import { IconPencil } from "@tabler/icons-react";

interface RenameDialogProps {
  isOpen: boolean;
  currentName: string;
  onRename: (name: string) => void;
  onClose: () => void;
}

/**
 * Rename a file or folder. Uncontrolled input seeded from `currentName`; the
 * parent remounts this via a `key` per target so each open starts fresh,
 * keeping form state out of FilesClient.
 */
export default function RenameDialog({
  isOpen,
  currentName,
  onRename,
  onClose,
}: RenameDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  const submit = useCallback(() => {
    const value = inputRef.current?.value.trim() ?? "";
    if (value && value !== currentName) {
      onRename(value);
    } else {
      onClose();
    }
  }, [currentName, onRename, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [submit, onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm" hideCloseButton>
        <DialogHeader className="border-b border-separator pb-4">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <IconPencil size={18} stroke={1.5} />
            Rename
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <input
            ref={inputRef}
            type="text"
            defaultValue={currentName}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full rounded-field border border-border bg-field-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-field-placeholder focus:ring-1 focus:ring-focus-ring"
          />
        </div>

        <DialogFooter className="border-t border-separator pt-4">
          <Button variant="ghost" onClick={onClose} className="text-muted">
            Cancel
          </Button>
          <Button onClick={submit}>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
