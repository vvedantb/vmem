import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vmem/backend";
import { toast } from "sonner";
import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CONFIRM_PHRASE = "delete all memories";

// type-to-confirm dialog for the wipe-all action
export default function DeleteAllMemoriesDialog({ open, onClose }: Props) {
  const deleteAll = useAction(api.memoryApi.deleteAllMemories);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const deleted = await deleteAll();
      // if/else rather than a ternary, and the reset after the try rather than
      // in a `finally`: React Compiler bails on the whole file for either.
      if (deleted === 1) {
        toast.success("Deleted 1 memory and all related data.");
      } else {
        toast.success(
          `Deleted ${String(deleted)} memories and all related data.`,
        );
      }
      onClose();
    } catch {
      toast.error("Couldn't delete your memories. Try again in a moment.");
    }
    setSubmitting(false);
  };

  return (
    <DestructiveConfirmDialog
      open={open}
      onClose={onClose}
      title="Delete all memories?"
      description="Every memory you own will be permanently removed, along with their tags, relationships, chunks, and history. This cannot be undone."
      confirmLabel="Delete everything"
      submittingLabel="Deleting…"
      submitting={submitting}
      onConfirm={() => void handleConfirm()}
      confirmPhrase={CONFIRM_PHRASE}
    />
  );
}
