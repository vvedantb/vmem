"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@vmem/ui";
import type { AvailableProvider } from "./importProviders";

type UploadImportModalProps = {
  open: boolean;
  provider: AvailableProvider;
  onClose: () => void;
  onFile: (file: File) => void;
  isParsing: boolean;
};

export default function UploadImportModal({
  open,
  provider,
  onClose,
  onFile,
  isParsing,
}: UploadImportModalProps) {
  const cfg = provider.instructions;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">{cfg.title}</DialogTitle>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          {cfg.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={handleDrop}
          className="mt-4 flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-secondary/20 px-4 py-8 text-center text-sm text-muted transition-colors hover:bg-surface-secondary/35"
        >
          <span className="font-medium text-foreground">
            Drop export file here
          </span>
          <span className="mt-1">or click to choose a file</span>
          <Input
            type="file"
            accept={cfg.accept}
            className="sr-only"
            onChange={handleChange}
            disabled={isParsing}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
