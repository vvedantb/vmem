import { IconMoodEmpty, IconArrowBack } from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import { VmemSpinner } from "@/components/icons/animations";

export function MemoryGraphStatus({
  variant,
  errorMessage,
  onViewGlobal,
}: {
  variant: "loading" | "error" | "empty";
  errorMessage?: string;
  // local-scope escape when focus resolves to an empty neighbourhood
  onViewGlobal?: () => void;
}) {
  if (variant === "loading") {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <VmemSpinner size={24} className="text-muted" />
      </div>
    );
  }

  if (variant === "error") {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
          <IconMoodEmpty className="h-6 w-6 text-muted" />
        </div>
        <h3 className="mb-2 text-balance text-lg font-medium text-foreground">
          Failed to load graph
        </h3>
        <p className="max-w-sm text-sm text-muted">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
        <IconMoodEmpty className="h-6 w-6 text-muted" />
      </div>
      <h3 className="mb-2 text-balance text-lg font-medium text-foreground">
        No memories to visualize
      </h3>
      <p className="text-sm text-muted">
        Add some memories to see them in the graph
      </p>
      {onViewGlobal ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onViewGlobal}
          className="mt-4 gap-1.5"
        >
          <IconArrowBack size={14} />
          View global graph
        </Button>
      ) : null}
    </div>
  );
}
