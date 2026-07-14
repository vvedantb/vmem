"use client";

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

interface EditKeyFormProps {
  keyName: string | undefined;
  isSaving: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

function EditKeyForm({
  keyName,
  isSaving,
  onSave,
  onCancel,
}: EditKeyFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { name: keyName ?? "" },
  });

  const onSubmit = ({ name }: ApiKeyFormValues) => {
    onSave(name.trim());
  };

  return (
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
          <p className="text-sm text-danger">{errors.name.message}</p>
        ) : null}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
          className="text-muted"
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
  );
}

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
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSaving) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">Rename API Key</DialogTitle>
          <DialogDescription className="text-muted">
            Update the display name for this key. The key value stays the same.
          </DialogDescription>
        </DialogHeader>
        {isOpen ? (
          <EditKeyForm
            key={keyName ?? ""}
            keyName={keyName}
            isSaving={isSaving}
            onSave={onSave}
            onCancel={onCancel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
