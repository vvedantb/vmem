"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
} from "@vmem/ui";
import {
  IconLoader2,
  IconCheck,
  IconCopy,
  IconKey,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { toast } from "sonner";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyCreated: () => void;
}

type ModalStep = "create" | "loading" | "success";

interface CreatedKey {
  id: string;
  name: string;
  key: string;
  maskedKey: string;
}

export default function ApiKeyModal({
  isOpen,
  onClose,
  onKeyCreated,
}: ApiKeyModalProps) {
  const [step, setStep] = useState<ModalStep>("create");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep("create");
      setName("");
      setNameError("");
      setCreatedKey(null);
      setCopied(false);
    }
  }, [isOpen]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setNameError("Please enter a name for your API key");
      return;
    }
    if (name.length > 50) {
      setNameError("Name must be 50 characters or less");
      return;
    }

    setNameError("");
    setStep("loading");

    try {
      const response = await fetch("/api/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create API key");
      }

      setCreatedKey(data.data);
      setStep("success");
      onKeyCreated();
    } catch (err) {
      setStep("create");
      toast.error(
        err instanceof Error ? err.message : "Failed to create API key",
      );
    }
  };

  const handleCopy = async () => {
    if (!createdKey) return;

    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleClose = () => {
    if (step !== "loading") {
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(value) => {
        if (!value) handleClose();
      }}
    >
      <DialogContent
        className="max-w-md bg-card border border-border"
        hideCloseButton={step === "loading"}
        onInteractOutside={(e) => {
          if (step === "loading") e.preventDefault();
        }}
      >
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-foreground">
            {step === "success" ? "API Key Created" : "Create New API Key"}
          </DialogTitle>
        </DialogHeader>

        {step === "create" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border border-border">
              <IconKey
                size={20}
                className="text-muted-foreground flex-shrink-0"
              />
              <p className="text-sm text-muted-foreground">
                Create a new API key to access vMemory programmatically. You can
                use this key with MCP clients and other integrations.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted-foreground">
                Key Name
              </label>
              <Input
                placeholder="e.g., Production App, Development"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-border bg-transparent"
              />
              {nameError ? (
                <p className="text-sm text-destructive">{nameError}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choose a descriptive name to identify this key
                </p>
              )}
            </div>
          </div>
        )}

        {step === "loading" && (
          <div className="py-8 space-y-4 text-center">
            <IconLoader2
              size={32}
              className="animate-spin text-muted-foreground mx-auto"
            />
            <div className="space-y-2">
              <p className="text-foreground font-medium">Creating API Key...</p>
              <p className="text-sm text-muted-foreground">
                Please wait while we generate your key
              </p>
            </div>
          </div>
        )}

        {step === "success" && createdKey && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
              <IconAlertTriangle
                size={20}
                className="text-warning flex-shrink-0"
              />
              <p className="text-sm text-warning">
                Make sure to copy your API key now. You won&apos;t be able to
                see it again!
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Your API Key
              </label>
              <div className="flex gap-2">
                <Input
                  value={createdKey.key}
                  readOnly
                  className="font-mono text-sm border-border bg-muted/50"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className={copied ? "bg-success/10 text-success" : "bg-muted"}
                >
                  {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                </Button>
              </div>
            </div>

            <div className="pt-2 space-y-1 text-sm text-muted-foreground">
              <p>
                <span className="font-medium">Name:</span> {createdKey.name}
              </p>
              <p>
                <span className="font-medium">Masked Key:</span>{" "}
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                  {createdKey.maskedKey}
                </code>
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-border pt-4">
          {step === "create" && (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                className="bg-primary text-primary-foreground"
              >
                Create Key
              </Button>
            </>
          )}

          {step === "loading" && (
            <p className="text-sm text-muted-foreground w-full text-center">
              Do not close this window
            </p>
          )}

          {step === "success" && (
            <Button
              onClick={handleClose}
              className="bg-primary text-primary-foreground"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
