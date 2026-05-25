"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { apiKeySchema, type ApiKeyFormValues } from "@/lib/schemas";

interface EditKeyDialogProps {
  keyName: string | undefined;
  isOpen: boolean;
  isSaving: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function EditKeyDialog({
  keyName,
  isOpen,
  isSaving,
  onSave,
  onCancel,
}: EditKeyDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { name: keyName ?? "" },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ name: keyName ?? "" });
    }
  }, [isOpen, keyName, reset]);

  const onSubmit = ({ name }: ApiKeyFormValues) => {
    onSave(name.trim());
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSaving) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm bg-card border border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Rename API Key</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Update the display name for this key. The key value stays the same.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Input
              {...register("name")}
              placeholder="e.g. Production server"
              autoFocus
              disabled={isSaving}
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isSaving}
              className="text-muted-foreground"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <IconLoader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
