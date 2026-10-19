import type { ReactNode } from "react";
import { ConfirmDialog } from "@vvedantb/ui";

type DestructiveConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  submittingLabel: string;
  submitting: boolean;
  onConfirm: () => void;
  // highlighted line above the muted description (body slot)
  children?: ReactNode;
  // when set, confirm stays disabled until the user types this phrase
  // (case-insensitive, trimmed)
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
  return (
    <ConfirmDialog.Root
      alert={false}
      pending={submitting}
      confirmPhrase={confirmPhrase}
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <ConfirmDialog.Content className="sm:max-w-md">
        <ConfirmDialog.Header>
          <ConfirmDialog.Title>{title}</ConfirmDialog.Title>
          {children ? (
            <>
              <ConfirmDialog.Description className="sr-only">
                {title}
              </ConfirmDialog.Description>
              <div className="text-sm">
                <p className="text-foreground">{children}</p>
                <p className="mt-1 text-muted">{description}</p>
              </div>
            </>
          ) : (
            <ConfirmDialog.Description>{description}</ConfirmDialog.Description>
          )}
        </ConfirmDialog.Header>
        {confirmPhrase !== undefined ? (
          <ConfirmDialog.Field onEnter={onConfirm} />
        ) : null}
        <ConfirmDialog.Footer>
          <ConfirmDialog.Cancel />
          <ConfirmDialog.Action
            variant="destructive"
            pendingLabel={submittingLabel}
            spinnerSize={14}
            onClick={onConfirm}
          >
            {confirmLabel}
          </ConfirmDialog.Action>
        </ConfirmDialog.Footer>
      </ConfirmDialog.Content>
    </ConfirmDialog.Root>
  );
}
