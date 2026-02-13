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
          <DialogTitle className="text-neutral-800 dark:text-neutral-200">
            Connect to {connectorName}
          </DialogTitle>
        </DialogHeader>

        {step === "authorize" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
              <IconLock size={20} className="text-neutral-500 flex-shrink-0" />
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                You&apos;ll be redirected to {connectorName} to authorize
                access. This is a secure OAuth connection.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                vmemory will be able to:
              </p>
              <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-green-500" />
                  Read files and documents
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-green-500" />
                  Access file metadata
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-green-500" />
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
              className="animate-spin text-neutral-400 mx-auto"
            />
            <div className="space-y-2">
              <p className="text-neutral-800 dark:text-neutral-200 font-medium">
                Connecting to {connectorName}...
              </p>
              <p className="text-sm text-neutral-500">
                Please wait while we establish the connection
              </p>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full w-1/3 rounded-full bg-black dark:bg-white animate-[indeterminate_1.5s_ease-in-out_infinite]" />
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="py-8 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <IconCheck size={24} className="text-green-500" />
            </div>
            <div className="space-y-1">
              <p className="text-neutral-800 dark:text-neutral-200 font-medium">
                Connected Successfully!
              </p>
              <p className="text-sm text-neutral-500">
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
                className="text-neutral-600 dark:text-neutral-400"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAuthorize}
                className="bg-black dark:bg-white text-white dark:text-black"
              >
                Authorize
                <IconExternalLink size={16} />
              </Button>
            </>
          )}

          {step === "connecting" && (
            <p className="text-sm text-neutral-500 w-full text-center">
              Do not close this window
            </p>
          )}

          {step === "complete" && (
            <p className="text-sm text-neutral-500 w-full text-center">
              Redirecting...
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
