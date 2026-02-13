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
        className="max-w-md bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        hideCloseButton={step === "loading"}
        onInteractOutside={(e) => {
          if (step === "loading") e.preventDefault();
        }}
      >
        <DialogHeader className="border-b border-black/10 dark:border-white/10 pb-4">
          <DialogTitle className="text-neutral-800 dark:text-neutral-200">
            {step === "success" ? "API Key Created" : "Create New API Key"}
          </DialogTitle>
        </DialogHeader>

        {step === "create" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
              <IconKey size={20} className="text-neutral-500 flex-shrink-0" />
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Create a new API key to access vMemory programmatically. You can
                use this key with MCP clients and other integrations.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Key Name
              </label>
              <Input
                placeholder="e.g., Production App, Development"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-black/10 dark:border-white/10 bg-transparent"
              />
              {nameError ? (
                <p className="text-sm text-red-500">{nameError}</p>
              ) : (
                <p className="text-sm text-neutral-500">
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
              className="animate-spin text-neutral-400 mx-auto"
            />
            <div className="space-y-2">
              <p className="text-neutral-800 dark:text-neutral-200 font-medium">
                Creating API Key...
              </p>
              <p className="text-sm text-neutral-500">
                Please wait while we generate your key
              </p>
            </div>
          </div>
        )}

        {step === "success" && createdKey && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <IconAlertTriangle
                size={20}
                className="text-amber-600 dark:text-amber-400 flex-shrink-0"
              />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Make sure to copy your API key now. You won&apos;t be able to
                see it again!
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Your API Key
              </label>
              <div className="flex gap-2">
                <Input
                  value={createdKey.key}
                  readOnly
                  className="font-mono text-sm border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className={
                    copied
                      ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                      : "bg-black/5 dark:bg-white/5"
                  }
                >
                  {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                </Button>
              </div>
            </div>

            <div className="pt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              <p>
                <span className="font-medium">Name:</span> {createdKey.name}
              </p>
              <p>
                <span className="font-medium">Masked Key:</span>{" "}
                <code className="font-mono text-xs bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded">
                  {createdKey.maskedKey}
                </code>
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-black/10 dark:border-white/10 pt-4">
          {step === "create" && (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-neutral-600 dark:text-neutral-400"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                className="bg-black dark:bg-white text-white dark:text-black"
              >
                Create Key
              </Button>
            </>
          )}

          {step === "loading" && (
            <p className="text-sm text-neutral-500 w-full text-center">
              Do not close this window
            </p>
          )}

          {step === "success" && (
            <Button
              onClick={handleClose}
              className="bg-black dark:bg-white text-white dark:text-black"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
