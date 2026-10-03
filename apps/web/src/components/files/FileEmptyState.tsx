import { IconFolder } from "@tabler/icons-react";

// mirrors the skills index empty: centred icon + one muted sentence
function FileEmptyStateLayout({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-20 text-center">
      <IconFolder size={40} className="mb-3 text-muted" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

export function FileEmptyStateRoot() {
  return (
    <FileEmptyStateLayout message="No files yet. Use Add to upload a file or create a folder." />
  );
}

export function FileEmptyStateFolder() {
  return (
    <FileEmptyStateLayout message="This folder is empty. Use Add to upload a file or create a folder." />
  );
}
