import { IconFolder, IconUpload } from "@tabler/icons-react";
import { Button } from "@vmem/ui";

interface FileEmptyStateLayoutProps {
  title: string;
  description: string;
  onUpload: () => void;
}

function FileEmptyStateLayout({
  title,
  description,
  onUpload,
}: FileEmptyStateLayoutProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <IconFolder size={40} stroke={1.2} className="text-muted/60 mb-3" />
      <h3 className="text-base font-medium text-foreground mb-1 text-balance">
        {title}
      </h3>
      <p className="text-sm text-muted mb-4">{description}</p>
      <Button onClick={onUpload} size="sm">
        <IconUpload size={16} stroke={1.5} />
        Upload
      </Button>
    </div>
  );
}

export function FileEmptyStateRoot({ onUpload }: { onUpload: () => void }) {
  return (
    <FileEmptyStateLayout
      title="No files yet"
      description="Upload files or create a folder to get started"
      onUpload={onUpload}
    />
  );
}

export function FileEmptyStateFolder({ onUpload }: { onUpload: () => void }) {
  return (
    <FileEmptyStateLayout
      title="This folder is empty"
      description="Upload files or create a folder"
      onUpload={onUpload}
    />
  );
}
