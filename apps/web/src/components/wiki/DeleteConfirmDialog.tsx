import { useState } from "react";
import type { WikiListNode, WikiNodeId } from "./-types";
import { wikiKindLabel } from "@vmem/shared";
import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";

interface DeleteConfirmDialogProps {
  target: WikiListNode | null;
  onClose: () => void;
  onConfirm: (id: WikiNodeId) => Promise<void>;
}

// confirms deletion of a folder or document
export default function DeleteConfirmDialog({
  target,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!target) return;
    setSubmitting(true);
    // the reset is duplicated into a rethrowing catch rather than a `finally`
    // react Compiler bails on the whole file for a `finally`, and for a `try`
    // with no `catch` at all.
    try {
      await onConfirm(target._id);
    } catch (err) {
      setSubmitting(false);
      throw err;
    }
    setSubmitting(false);
  };

  const isFolder = target?.kind === "folder";
  const kindLabel = target ? wikiKindLabel(target.kind) : "document";
  const title = target?.title ?? "";

  return (
    <DestructiveConfirmDialog
      open={target !== null}
      onClose={onClose}
      title={`Delete ${kindLabel}?`}
      description={
        isFolder
          ? `"${title}" and everything inside it will be permanently removed.`
          : `"${title}" will be permanently removed.`
      }
      confirmLabel="Delete"
      submittingLabel="Deleting..."
      submitting={submitting}
      onConfirm={() => {
        void handleConfirm();
      }}
    />
  );
}
