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

const alertIcon = (
  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10">
    <IconAlertTriangle size={20} className="text-danger" />
  </div>
);

type KeyConfirmDialogProps = {
  isOpen: boolean;
  isBusy: boolean;
  title: string;
  detail: string;
  confirmLabel: string;
  busyLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
};

export function KeyConfirmDialog({
  isOpen,
  isBusy,
  title,
  detail,
  confirmLabel,
  busyLabel,
  onConfirm,
  onCancel,
  children,
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
          {alertIcon}
          <div>
            <p className="text-foreground">{children}</p>
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
