import type { ReactNode } from "react";
import { Card, CardContent, cn } from "@vmem/ui";
import { formatRelativeTime } from "@/lib/formatters";

export function ProposalFieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-xs font-medium text-muted">{children}</div>
  );
}

export function ProposalTextBlock({
  label,
  children,
  muted = false,
  className,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-surface-secondary/50 p-3", className)}>
      <ProposalFieldLabel>{label}</ProposalFieldLabel>
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-sm",
          muted ? "text-muted" : "text-foreground",
        )}
      >
        {children}
      </p>
    </div>
  );
}

export function ProposalShell({
  accentClass,
  meta,
  title,
  timestamp,
  actions,
  children,
}: {
  accentClass: string;
  meta: ReactNode;
  title: string;
  timestamp: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden shadow-none">
      <div
        className={cn("absolute inset-y-0 left-0 z-10 w-1", accentClass)}
        aria-hidden
      />
      <CardContent className="flex flex-col gap-4 p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {meta}
              <span aria-hidden>·</span>
              <time dateTime={timestamp} title={timestamp}>
                {formatRelativeTime(timestamp)}
              </time>
            </div>
            <h3 className="text-base font-medium leading-snug text-foreground text-balance">
              {title}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </CardContent>
    </Card>
  );
}
