"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAction } from "convex/react";
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
  IconAlertCircle,
} from "@tabler/icons-react";
import { api, type Id } from "@vmem/backend";

interface OAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectorId: Id<"connectors">;
  connectorName: string;
  onComplete: () => void;
}

type OAuthStep = "authorize" | "connecting" | "complete" | "error";

export default function OAuthModal({
  isOpen,
  onClose,
  connectorId,
  connectorName,
  onComplete,
}: OAuthModalProps) {
  const [step, setStep] = useState<OAuthStep>("authorize");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startOAuth = useAction(api.connectors.oauth.startOAuth);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
  }, []);

  // Handle message from popup
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Validate message origin and type
      if (event.data?.type !== "connector-oauth-complete") return;

      cleanup();

      if (event.data.success) {
        setStep("complete");
        setTimeout(() => {
          onComplete();
          onClose();
        }, 1000);
      } else {
        setStep("error");
        setErrorMessage(event.data.error ?? "Connection failed");
      }
    },
    [cleanup, onComplete, onClose],
  );

  // Setup message listener
  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      cleanup();
    };
  }, [handleMessage, cleanup]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("authorize");
      setErrorMessage(null);
    } else {
      cleanup();
    }
  }, [isOpen, cleanup]);

  const handleAuthorize = async () => {
    setStep("connecting");
    setErrorMessage(null);

    try {
      // Get OAuth URL from Convex (pass origin for postMessage security)
      const result = await startOAuth({
        connectorId,
        returnUrl: window.location.origin,
      });

      if (result.alreadyConnected) {
        setStep("complete");
        setTimeout(() => {
          onComplete();
          onClose();
        }, 1000);
        return;
      }

      if (!result.authUrl) {
        setStep("error");
        setErrorMessage("No authorization URL returned — please try again.");
        return;
      }

      // Open popup
      const popup = window.open(
        result.authUrl,
        "oauth-popup",
        "width=600,height=700,left=100,top=100",
      );

      if (!popup) {
        setStep("error");
        setErrorMessage(
          "Popup blocked. Please allow popups for this site and try again.",
        );
        return;
      }

      popupRef.current = popup;

      // Poll for popup close (user cancelled)
      pollIntervalRef.current = setInterval(() => {
        if (popup.closed) {
          cleanup();
          // Only set to authorize if we haven't received a message
          setStep((currentStep) => {
            if (currentStep === "connecting") {
              return "authorize";
            }
            return currentStep;
          });
        }
      }, 500);
    } catch (err) {
      setStep("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start OAuth",
      );
    }
  };

  const handleClose = () => {
    if (step !== "connecting") {
      cleanup();
      onClose();
    }
  };

  const handleRetry = () => {
    setStep("authorize");
    setErrorMessage(null);
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
            <div className="flex items-center gap-3 p-4 rounded-lg bg-surface-secondary/50">
              <IconLock size={20} className="text-muted flex-shrink-0" />
              <p className="text-sm text-muted">
                You&apos;ll be redirected to {connectorName} to authorize
                access. This is a secure OAuth connection.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                vmemory will be able to:
              </p>
              <ul className="space-y-1 text-sm text-muted">
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
              className="animate-spin text-muted mx-auto"
            />
            <div className="space-y-2">
              <p className="text-foreground font-medium">
                Connecting to {connectorName}...
              </p>
              <p className="text-sm text-muted">
                Complete the authorization in the popup window
              </p>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
              <div className="h-full w-1/3 rounded-full bg-surface-tertiary animate-indeterminate" />
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
              <p className="text-sm text-muted">
                {connectorName} is now linked to your account
              </p>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="py-8 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto">
              <IconAlertCircle size={24} className="text-danger" />
            </div>
            <div className="space-y-1">
              <p className="text-foreground font-medium">Connection Failed</p>
              <p className="text-sm text-muted">
                {errorMessage ?? "An error occurred during authorization"}
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
                className="text-muted"
              >
                Cancel
              </Button>
              <Button onClick={handleAuthorize}>
                Authorize
                <IconExternalLink size={16} />
              </Button>
            </>
          )}

          {step === "connecting" && (
            <p className="text-sm text-muted w-full text-center">
              Do not close this window
            </p>
          )}

          {step === "complete" && (
            <p className="text-sm text-muted w-full text-center">
              Redirecting...
            </p>
          )}

          {step === "error" && (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-muted"
              >
                Cancel
              </Button>
              <Button onClick={handleRetry}>Try Again</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
