import { useState } from "react";
import type { WikiListNode, WikiNodeId } from "./-types";
import { wikiKindLabel } from "@vmem/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@vmem/ui";

interface RenameDialogProps {
  target: WikiListNode | null;
  onClose: () => void;
  onConfirm: (id: WikiNodeId, title: string) => Promise<void>;
}

interface RenameDialogFormProps {
  target: WikiListNode;
  onClose: () => void;
  onConfirm: (id: WikiNodeId, title: string) => Promise<void>;
}

function RenameDialogForm({
  target,
  onClose,
  onConfirm,
}: RenameDialogFormProps) {
  const [title, setTitle] = useState(target.title);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed === target.title) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(target._id, trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Rename {wikiKindLabel(target.kind)}</DialogTitle>
      </DialogHeader>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleSubmit();
          }
        }}
        placeholder="Title"
      />
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={submitting}>
          Rename
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// shared rename dialog for folders + documents
export default function RenameDialog({
  target,
  onClose,
  onConfirm,
}: RenameDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target !== null ? (
        <RenameDialogForm
          key={target._id}
          target={target}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Dialog>
  );
}
