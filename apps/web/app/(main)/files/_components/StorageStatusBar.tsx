import { Progress } from "@vmem/ui";

interface StorageStatusBarProps {
  itemCount: number;
  totalBytes: number;
  storageLimit: number;
}

export default function StorageStatusBar({
  itemCount,
  totalBytes,
  storageLimit,
}: StorageStatusBarProps) {
  const usedGB = totalBytes / (1024 * 1024 * 1024);
  const limitGB = storageLimit / (1024 * 1024 * 1024);
  const percent = storageLimit > 0 ? (totalBytes / storageLimit) * 100 : 0;

  return (
    <div className="flex-shrink-0 border-t border-border px-4 py-2 flex items-center gap-3">
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {itemCount} {itemCount === 1 ? "item" : "items"} · {usedGB.toFixed(2)}{" "}
        GB of {limitGB} GB
      </span>
      <Progress value={percent} className="h-1 flex-1 max-w-32 bg-muted" />
    </div>
  );
}
