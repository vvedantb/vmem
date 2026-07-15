import type { ReactNode } from "react";
import { IconMoodEmpty } from "@tabler/icons-react";
import { VmemSpinner } from "@/components/icons/animations";

export function GraphStatus({
  variant,
  title,
  description,
  action,
}: {
  variant: "loading" | "error" | "empty";
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  if (variant === "loading") {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <VmemSpinner size={24} className="text-muted" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
        <IconMoodEmpty className="h-6 w-6 text-muted" />
      </div>
      {title ? (
        <h3 className="mb-2 text-balance text-lg font-medium text-foreground">
          {title}
        </h3>
      ) : null}
      {description ? (
        <p className="max-w-sm text-sm text-muted">{description}</p>
      ) : null}
      {action ?? null}
    </div>
  );
}
