"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from "@vmem/ui";
import {
  IconLoader2,
  IconCheck,
  IconLock,
  IconExternalLink,
} from "@tabler/icons-react";

interface OAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectorName: string;
  onComplete: () => void;
}

type OAuthStep = "authorize" | "connecting" | "complete";

export default function OAuthModal({
  isOpen,
  onClose,
  connectorName,
  onComplete,
}: OAuthModalProps) {
  const [step, setStep] = useState<OAuthStep>("authorize");

  useEffect(() => {
    if (isOpen) {
      setStep("authorize");
    }
  }, [isOpen]);

  const handleAuthorize = async () => {
    setStep("connecting");

    await new Promise((resolve) => setTimeout(resolve, 2000));

    setStep("complete");

    setTimeout(() => {
      onComplete();
      onClose();
    }, 1000);
  };

  const handleClose = () => {
    if (step !== "connecting") {
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        hideCloseButton={step === "connecting"}
        onInteractOutside={(e) => {
          if (step === "connecting") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (step === "connecting") e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Connect to {connectorName}
          </DialogTitle>
        </DialogHeader>

        {step === "authorize" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border border-border">
              <IconLock
                size={20}
                className="text-muted-foreground flex-shrink-0"
              />
              <p className="text-sm text-muted-foreground">
                You&apos;ll be redirected to {connectorName} to authorize
                access. This is a secure OAuth connection.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                vmemory will be able to:
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-success" />
                  Read files and documents
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-success" />
                  Access file metadata
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-success" />
                  Sync content to your memory
                </li>
              </ul>
            </div>
          </div>
        )}

        {step === "connecting" && (
          <div className="py-8 space-y-4 text-center">
            <IconLoader2
              size={32}
              className="animate-spin text-muted-foreground mx-auto"
            />
            <div className="space-y-2">
              <p className="text-foreground font-medium">
                Connecting to {connectorName}...
              </p>
              <p className="text-sm text-muted-foreground">
                Please wait while we establish the connection
              </p>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 rounded-full bg-primary animate-[indeterminate_1.5s_ease-in-out_infinite]" />
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="py-8 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <IconCheck size={24} className="text-success" />
            </div>
            <div className="space-y-1">
              <p className="text-foreground font-medium">
                Connected Successfully!
              </p>
              <p className="text-sm text-muted-foreground">
                {connectorName} is now linked to your account
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "authorize" && (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAuthorize}
                className="bg-primary text-primary-foreground"
              >
                Authorize
                <IconExternalLink size={16} />
              </Button>
            </>
          )}

          {step === "connecting" && (
            <p className="text-sm text-muted-foreground w-full text-center">
              Do not close this window
            </p>
          )}

          {step === "complete" && (
            <p className="text-sm text-muted-foreground w-full text-center">
              Redirecting...
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
