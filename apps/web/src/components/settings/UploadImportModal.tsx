"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";

export type ImportProvider = "chatgpt" | "claude";

type UploadImportModalProps = {
  open: boolean;
  provider: ImportProvider;
  onClose: () => void;
  onFile: (file: File) => void;
  isParsing: boolean;
};

const instructions: Record<
  ImportProvider,
  { title: string; steps: string[]; accept: string }
> = {
  chatgpt: {
    title: "ChatGPT export",
    steps: [
      "Open ChatGPT → Settings → Data controls → Export data.",
      "Confirm export and download the ZIP when it is ready.",
      "Upload that ZIP here, or extract it and upload conversations.json.",
    ],
    accept: ".zip,.json,application/zip,application/json",
  },
  claude: {
    title: "Claude export",
    steps: [
      "Open Claude on the web → Settings → Privacy → Export data.",
      "Use the email download link within 24 hours and save the archive.",
      "Upload the ZIP or the JSON file from the export.",
    ],
    accept: ".zip,.json,application/zip,application/json",
  },
};

export default function UploadImportModal({
  open,
  provider,
  onClose,
  onFile,
  isParsing,
}: UploadImportModalProps) {
  const cfg = instructions[provider];

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
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
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
          className="mt-4 flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/35"
        >
          <span className="font-medium text-foreground">
            Drop export file here
          </span>
          <span className="mt-1">or click to choose a file</span>
          <input
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
