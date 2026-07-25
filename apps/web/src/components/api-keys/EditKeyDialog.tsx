import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";
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
  const { submitting: isSubmitting, run } = useAsyncSubmit();

  const renameApiKey = useMutation(api.apiKeys.renameMy).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.apiKeys.listMy, {});
      if (list === undefined) return;
      localStore.setQuery(
        api.apiKeys.listMy,
        {},
        list.map((key) =>
          key.id === args.id ? { ...key, name: args.name } : key,
        ),
      );
    },
  );

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

    await run(async () => {
      await renameApiKey({ id: apiKey.id, name: trimmed });
      onClose();
    }, "Failed to rename API key");
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
