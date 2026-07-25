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
      toast.success(
        deleted === 1
          ? "Deleted 1 memory and all related data."
          : `Deleted ${String(deleted)} memories and all related data.`,
      );
      onClose();
    } catch {
      toast.error("Couldn't delete your memories. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
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
