import type { ReactNode } from "react";
import type { TablerIcon } from "@tabler/icons-react";

interface DetailEmptyStateProps {
  icon: TablerIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function DetailEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: DetailEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-surface-secondary px-4 py-10 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-surface-tertiary">
        <Icon size={22} className="text-muted" stroke={1.5} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-[240px] text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
