"use client";

import { useMutation, useQuery } from "convex/react";
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
  apiKeyId: ApiKey["id"] | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditKeyDialog({
  apiKeyId,
  isOpen,
  onClose,
}: EditKeyDialogProps) {
  const apiKeys = useQuery(api.apiKeys.listMy, isOpen ? {} : "skip");
  const apiKey = apiKeys?.find((row) => row.id === apiKeyId);

  const renameApiKey = useMutation(api.apiKeys.renameMy).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.apiKeys.listMy, {});
      if (!list) return;
      localStore.setQuery(
        api.apiKeys.listMy,
        {},
        list.map((row) =>
          row.id === args.id ? { ...row, name: args.name.trim() } : row,
        ),
      );
    },
  );

  const handleNameChange = (name: string) => {
    if (!apiKey || name === apiKey.name) return;

    void renameApiKey({ id: apiKey.id, name }).catch((err: unknown) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to rename API key",
      );
    });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
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
                value={apiKey.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Production server"
                autoFocus
                aria-label="API key name"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="text-muted"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : isOpen ? (
          <div className="flex justify-center py-6">
            <IconLoader2 size={20} className="animate-spin text-muted" />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
