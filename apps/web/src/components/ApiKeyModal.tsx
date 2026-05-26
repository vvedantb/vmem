"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
} from "@vmem/ui";
import { IconLoader2, IconCheck, IconCopy, IconKey } from "@tabler/icons-react";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import { apiKeySchema, type ApiKeyFormValues } from "@/lib/schemas";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyCreated: () => void;
}

type ModalStep = "create" | "success";
type CreatedKey = FunctionReturnType<typeof api.apiKeys.createMy>;

export default function ApiKeyModal({
  isOpen,
  onClose,
  onKeyCreated,
}: ApiKeyModalProps) {
  const createApiKey = useAction(api.apiKeys.createMy);
  const [step, setStep] = useState<ModalStep>("create");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (isOpen) {
      setStep("create");
      setCreatedKey(null);
      setCopied(false);
      reset();
    }
  }, [isOpen, reset]);

  const onSubmit = async ({ name }: ApiKeyFormValues) => {
    try {
      const created = await createApiKey({ name: name.trim() });
      setCreatedKey(created);
      setStep("success");
      onKeyCreated();
    } catch (err) {
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
    if (!isSubmitting) {
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
        className="max-w-md"
        hideCloseButton={isSubmitting}
        onInteractOutside={(e) => {
          if (isSubmitting) e.preventDefault();
        }}
      >
        <DialogHeader className="pb-5">
          <DialogTitle className="text-foreground">
            {step === "success" ? "API Key Created" : "Create New API Key"}
          </DialogTitle>
        </DialogHeader>

        {step === "create" && !isSubmitting && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-surface-secondary/50 border border-border">
              <IconKey size={20} className="text-muted flex-shrink-0" />
              <p className="text-sm text-muted">
                Create a new API key to access vMemory programmatically. You can
                use this key with MCP clients and other integrations.
              </p>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="Key name (e.g., Production App)"
                {...register("name")}
                className="border-border bg-transparent"
              />
              {errors.name ? (
                <p className="text-sm text-danger">{errors.name.message}</p>
              ) : (
                <p className="text-sm text-muted">
                  Choose a descriptive name to identify this key
                </p>
              )}
            </div>
          </div>
        )}

        {isSubmitting && (
          <div className="py-8 space-y-4 text-center">
            <IconLoader2
              size={32}
              className="animate-spin text-muted mx-auto"
            />
            <div className="space-y-2">
              <p className="text-foreground font-medium">Creating API Key...</p>
              <p className="text-sm text-muted">
                Please wait while we generate your key
              </p>
            </div>
          </div>
        )}

        {step === "success" && createdKey && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Your API Key
              </label>
              <div className="flex gap-2">
                <Input
                  value={createdKey.key}
                  readOnly
                  className="font-mono text-sm border-border bg-surface-secondary/50"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className={
                    copied
                      ? "bg-success/10 text-success"
                      : "bg-surface-secondary"
                  }
                >
                  {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                </Button>
              </div>
            </div>

            <div className="pt-2 space-y-1 text-sm text-muted">
              <p>
                <span className="font-medium">Name:</span> {createdKey.name}
              </p>
              <p>
                <span className="font-medium">Masked Key:</span>{" "}
                <code className="font-mono text-xs bg-surface-secondary px-1 py-0.5 rounded">
                  {createdKey.maskedKey}
                </code>
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="pt-5">
          {step === "create" && !isSubmitting && (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={isSubmitting}
                className="text-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit(onSubmit)}
                disabled={isSubmitting}
                className="bg-surface-tertiary text-accent-foreground"
              >
                Create Key
              </Button>
            </>
          )}

          {isSubmitting && (
            <p className="text-sm text-muted w-full text-center">
              Do not close this window
            </p>
          )}

          {step === "success" && (
            <Button
              onClick={handleClose}
              className="bg-surface-tertiary text-accent-foreground"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
