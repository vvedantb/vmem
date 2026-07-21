import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
} from "@vmem/ui";
import { IconPencil } from "@tabler/icons-react";

interface RenameDialogProps {
  isOpen: boolean;
  currentName: string;
  onRename: (name: string) => void;
  onClose: () => void;
}

export default function RenameDialog({
  isOpen,
  currentName,
  onRename,
  onClose,
}: RenameDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const submit = () => {
    const value = inputRef.current?.value.trim() ?? "";
    if (value && value !== currentName) {
      onRename(value);
    } else {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

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
          <Input
            ref={inputRef}
            type="text"
            defaultValue={currentName}
            onKeyDown={handleKeyDown}
            autoFocus
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
