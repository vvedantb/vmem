import { AnimatedProgress } from "@/components/svg-animations";

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
    <div className="flex-shrink-0 border-t border-separator px-4 py-2 flex items-center gap-3">
      <span className="text-xs text-muted tabular-nums whitespace-nowrap">
        {itemCount} {itemCount === 1 ? "item" : "items"} · {usedGB.toFixed(2)}{" "}
        GB of {limitGB} GB
      </span>
      <AnimatedProgress
        value={percent}
        height={4}
        className="flex-1 max-w-32"
      />
    </div>
  );
}
