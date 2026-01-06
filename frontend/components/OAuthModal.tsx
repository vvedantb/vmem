"use client";

import { useState, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Progress,
} from "@heroui/react";
import {
  IconX,
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

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("authorize");
    }
  }, [isOpen]);

  const handleAuthorize = async () => {
    setStep("connecting");

    // Simulate OAuth redirect and callback
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setStep("complete");

    // Auto-close after success
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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      isDismissable={step !== "connecting"}
      classNames={{
        base: "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
        header: "border-b border-black/10 dark:border-white/10",
        body: "py-6",
        footer: "border-t border-black/10 dark:border-white/10",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center justify-between gap-4">
          <span className="text-neutral-800 dark:text-neutral-200 text-lg font-semibold">
            Connect to {connectorName}
          </span>
          <Button
            size="sm"
            variant="light"
            isIconOnly
            onPress={handleClose}
            isDisabled={step === "connecting"}
            className="text-neutral-500 flex-shrink-0"
          >
            <IconX size={18} />
          </Button>
        </ModalHeader>

        <ModalBody>
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
              <Progress
                isIndeterminate
                size="sm"
                classNames={{
                  track: "bg-black/10 dark:bg-white/10",
                  indicator: "bg-black dark:bg-white",
                }}
              />
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
        </ModalBody>

        <ModalFooter>
          {step === "authorize" && (
            <>
              <Button
                variant="light"
                onPress={handleClose}
                className="text-neutral-600 dark:text-neutral-400"
              >
                Cancel
              </Button>
              <Button
                onPress={handleAuthorize}
                className="bg-black dark:bg-white text-white dark:text-black"
                endContent={<IconExternalLink size={16} />}
              >
                Authorize
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
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
