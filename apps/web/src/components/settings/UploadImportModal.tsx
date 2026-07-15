import { useDropzone } from "react-dropzone";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import type { ImportProvider } from "./importProviders";

type UploadImportModalProps = {
  open: boolean;
  provider: ImportProvider;
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

  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    maxFiles: 1,
    disabled: isParsing,
    accept: cfg.accept,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) onFile(file);
    },
  });

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
        <div
          {...getRootProps({
            className:
              "mt-4 flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-secondary/20 px-4 py-8 text-center text-sm text-muted transition-colors hover:bg-surface-secondary/35",
          })}
        >
          <input {...getInputProps()} />
          <span className="font-medium text-foreground">
            Drop export file here
          </span>
          <span className="mt-1">or click to choose a file</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
