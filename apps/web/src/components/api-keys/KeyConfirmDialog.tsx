"use client";

import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@vmem/ui";
import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";

type KeyConfirmDialogProps = {
  isOpen: boolean;
  isBusy: boolean;
  title: string;
  lead: ReactNode;
  detail: string;
  confirmLabel: string;
  busyLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function KeyConfirmDialog({
  isOpen,
  isBusy,
  title,
  lead,
  detail,
  confirmLabel,
  busyLabel,
  onConfirm,
  onCancel,
}: KeyConfirmDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isBusy) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10">
            <IconAlertTriangle size={20} className="text-danger" />
          </div>
          <div>
            <p className="text-foreground">{lead}</p>
            <p className="mt-1 text-sm text-muted">{detail}</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isBusy}
            className="text-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isBusy}
            className="bg-danger text-danger-foreground"
          >
            {isBusy ? (
              <>
                <IconLoader2 size={16} className="animate-spin" />
                {busyLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
