import { useState, useEffect, useCallback, useRef } from "react";
import { useAction } from "convex/react";
import { useEventListener, useInterval, useTimeout } from "usehooks-ts";
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
import { z } from "zod";

interface OAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectorId: Id<"connectors">;
  connectorName: string;
  onComplete: () => void;
}

type OAuthStep = "authorize" | "connecting" | "complete" | "error";

const connectorOAuthCompleteSchema = z.object({
  type: z.literal("connector-oauth-complete"),
  success: z.boolean(),
  error: z.string().optional(),
});

export default function OAuthModal({
  isOpen,
  onClose,
  connectorId,
  connectorName,
  onComplete,
}: OAuthModalProps) {
  const [step, setStep] = useState<OAuthStep>("authorize");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollPopup, setPollPopup] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const popupRef = useRef<Window | null>(null);

  const startOAuth = useAction(api.connectors.oauth.startOAuth);

  const cleanup = useCallback(() => {
    setPollPopup(false);
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
  }, []);

  const finishSuccess = useCallback(() => {
    setStep("complete");
    setPendingClose(true);
  }, []);

  useTimeout(
    () => {
      onComplete();
      onClose();
      setPendingClose(false);
    },
    pendingClose ? 1000 : null,
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const parsed = connectorOAuthCompleteSchema.safeParse(event.data);
      if (!parsed.success) return;

      cleanup();

      if (parsed.data.success) {
        finishSuccess();
      } else {
        setStep("error");
        setErrorMessage(parsed.data.error ?? "Connection failed");
      }
    },
    [cleanup, finishSuccess],
  );

  useEventListener("message", handleMessage);

  useInterval(
    () => {
      const popup = popupRef.current;
      if (!popup || !popup.closed) return;
      cleanup();
      setStep((currentStep) =>
        currentStep === "connecting" ? "authorize" : currentStep,
      );
    },
    pollPopup ? 500 : null,
  );

  useEffect(() => {
    if (isOpen) {
      setStep("authorize");
      setErrorMessage(null);
      setPendingClose(false);
    } else {
      cleanup();
    }
  }, [isOpen, cleanup]);

  useEffect(() => cleanup, [cleanup]);

  const handleAuthorize = async () => {
    setStep("connecting");
    setErrorMessage(null);

    try {
      const result = await startOAuth({
        connectorId,
        returnUrl: window.location.origin,
      });

      if (result.alreadyConnected) {
        finishSuccess();
        return;
      }

      if (!result.authUrl) {
        setStep("error");
        setErrorMessage("No authorization URL returned — please try again.");
        return;
      }

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
      setPollPopup(true);
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

        {step === "authorize" ? (
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
        ) : null}

        {step === "connecting" ? (
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
        ) : null}

        {step === "complete" ? (
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
        ) : null}

        {step === "error" ? (
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
        ) : null}

        <DialogFooter>
          {step === "authorize" ? (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-muted"
              >
                Cancel
              </Button>
              <Button onClick={() => void handleAuthorize()}>
                Authorize
                <IconExternalLink size={16} />
              </Button>
            </>
          ) : null}

          {step === "connecting" ? (
            <p className="text-sm text-muted w-full text-center">
              Do not close this window
            </p>
          ) : null}

          {step === "complete" ? (
            <p className="text-sm text-muted w-full text-center">
              Redirecting...
            </p>
          ) : null}

          {step === "error" ? (
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
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
