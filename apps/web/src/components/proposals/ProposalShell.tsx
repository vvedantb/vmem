import { cn } from "@vmem/ui";
import { formatProposalRelativeDate } from "./_proposalUtils";

export function ProposalFieldLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 text-xs font-medium text-muted">{children}</div>
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
  meta: React.ReactNode;
  title: string;
  timestamp: string;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="relative overflow-hidden rounded-lg bg-surface-secondary/40">
      <div
        className={cn("absolute inset-y-0 left-0 w-1", accentClass)}
        aria-hidden
      />
      <div className="flex flex-col gap-4 p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {meta}
              <span aria-hidden>·</span>
              <time dateTime={timestamp} title={timestamp}>
                {formatProposalRelativeDate(timestamp)}
              </time>
            </div>
            <h3 className="text-base font-medium leading-snug text-foreground">
              {title}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </article>
  );
}
