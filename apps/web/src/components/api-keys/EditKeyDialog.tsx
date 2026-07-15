import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import type { ApiKey } from "./types";

interface EditKeyDialogProps {
  apiKey: ApiKey | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditKeyDialog({ apiKey, isOpen, onClose }: EditKeyDialogProps) {
  const [draftName, setDraftName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const renameApiKey = useMutation(api.apiKeys.renameMy);

  useEffect(() => {
    if (isOpen && apiKey) {
      setDraftName(apiKey.name);
    }
  }, [isOpen, apiKey]);

  const handleSubmit = async () => {
    if (!apiKey || isSubmitting) return;

    const trimmed = draftName.trim();
    if (!trimmed || trimmed === apiKey.name) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await renameApiKey({ id: apiKey.id, name: trimmed });
      onClose();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to rename API key",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">Rename API Key</DialogTitle>
          <DialogDescription className="text-muted">
            Update the display name for this key. The key value stays the same.
          </DialogDescription>
        </DialogHeader>
        {isOpen && apiKey ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSubmit();
                }}
                placeholder="e.g. Production server"
                autoFocus
                disabled={isSubmitting}
                aria-label="API key name"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                className="text-muted"
              >
                {isSubmitting ? (
                  <IconLoader2 size={14} className="animate-spin" />
                ) : null}
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
