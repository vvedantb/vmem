import { useRef } from "react";
import { ConfirmDialog, Input } from "@vvedantb/ui";
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
    <ConfirmDialog.Root
      alert={false}
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      <ConfirmDialog.Content className="max-w-sm" hideCloseButton>
        <ConfirmDialog.Header className="border-b border-separator pb-4">
          <ConfirmDialog.Title className="flex items-center gap-2 text-foreground">
            <IconPencil size={18} stroke={1.5} />
            Rename
          </ConfirmDialog.Title>
        </ConfirmDialog.Header>

        <ConfirmDialog.Body className="py-2">
          <Input
            ref={inputRef}
            type="text"
            defaultValue={currentName}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </ConfirmDialog.Body>

        <ConfirmDialog.Footer className="border-t border-separator pt-4">
          <ConfirmDialog.Cancel className="text-muted" />
          <ConfirmDialog.Action onClick={submit}>Rename</ConfirmDialog.Action>
        </ConfirmDialog.Footer>
      </ConfirmDialog.Content>
    </ConfirmDialog.Root>
  );
}
