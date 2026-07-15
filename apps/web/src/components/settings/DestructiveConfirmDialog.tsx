import { useEffect, useId, useState, type ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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
  /** Highlighted line above the muted description (body slot). */
  children?: ReactNode;
  /**
   * When set, confirm stays disabled until the user types this phrase
   * (case-insensitive, trimmed).
   */
  confirmPhrase?: string;
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
  confirmPhrase,
}: DestructiveConfirmDialogProps) {
  const confirmInputId = useId();
  const [typedConfirm, setTypedConfirm] = useState("");

  useEffect(() => {
    if (open) setTypedConfirm("");
  }, [open]);

  const phraseRequired = confirmPhrase !== undefined;
  const phraseMatches =
    !phraseRequired ||
    typedConfirm.trim().toLowerCase() === confirmPhrase.trim().toLowerCase();
  const confirmDisabled = submitting || !phraseMatches;

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
        {phraseRequired ? (
          <div className="space-y-2">
            <label htmlFor={confirmInputId} className="text-sm text-muted">
              Type{" "}
              <span className="font-mono text-foreground">{confirmPhrase}</span>{" "}
              to confirm
            </label>
            <Input
              id={confirmInputId}
              autoComplete="off"
              autoFocus
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              disabled={submitting}
              placeholder={confirmPhrase}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phraseMatches && !submitting) {
                  e.preventDefault();
                  onConfirm();
                }
              }}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={confirmDisabled}
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
