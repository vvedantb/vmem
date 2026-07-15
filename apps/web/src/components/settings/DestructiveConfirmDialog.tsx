"use client";

import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";

type DestructiveConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  submittingLabel: string;
  submitting: boolean;
  onConfirm: () => void;
  children?: ReactNode;
};

export default function DestructiveConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  submittingLabel,
  submitting,
  onConfirm,
  children,
}: DestructiveConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {children ? (
            <>
              <DialogDescription className="sr-only">{title}</DialogDescription>
              <div className="text-sm">
                <p className="text-foreground">{children}</p>
                <p className="mt-1 text-muted">{description}</p>
              </div>
            </>
          ) : (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : null}
            {submitting ? submittingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
