import { IconFolder, IconUpload } from "@tabler/icons-react";
import { Button } from "@vmem/ui";

interface FileEmptyStateProps {
  isRoot: boolean;
  onUpload: () => void;
}

export default function FileEmptyState({
  isRoot,
  onUpload,
}: FileEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <IconFolder size={40} stroke={1.2} className="text-muted/60 mb-3" />
      <h3 className="text-base font-medium text-foreground mb-1">
        {isRoot ? "No files yet" : "This folder is empty"}
      </h3>
      <p className="text-sm text-muted mb-4">
        {isRoot
          ? "Upload files or create a folder to get started"
          : "Upload files or create a folder"}
      </p>
      <Button
        onClick={onUpload}
        className="bg-surface-tertiary text-accent-foreground"
        size="sm"
      >
        <IconUpload size={16} stroke={1.5} />
        Upload
      </Button>
    </div>
  );
}
