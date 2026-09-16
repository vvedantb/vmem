import { formatCompactNumber } from "@vmem/shared";
import { cn } from "@vmem/ui";

export interface SidebarStats {
  addedToday: number;
  total: number;
}

function todaySharePercent(addedToday: number, total: number): number {
  if (total <= 0 || addedToday <= 0) return 0;
  return Math.min(100, (addedToday / total) * 100);
}

function StatsCard({ stats }: { stats: SidebarStats }) {
  const todayLabel = formatCompactNumber(stats.addedToday);
  const totalLabel = formatCompactNumber(stats.total);
  const sharePercent = todaySharePercent(stats.addedToday, stats.total);

  return (
    <div className="px-2">
      <div
        role="progressbar"
        aria-label={`${todayLabel} memories added today out of ${totalLabel} total`}
        aria-valuenow={sharePercent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative flex h-6 items-center justify-between overflow-hidden px-2 text-[10px] leading-none tabular-nums"
      >
        {sharePercent > 0 ? (
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 bg-foreground/10"
            style={{ width: `${sharePercent}%` }}
          />
        ) : null}
        <span className="relative z-10 text-muted">
          <span
            className={cn(
              stats.addedToday > 0 ? "text-foreground" : "text-muted",
            )}
          >
            {todayLabel}
          </span>
          <span> today</span>
        </span>
        <span className="relative z-10 text-muted">
          <span className="text-foreground">{totalLabel}</span>
          <span> total</span>
        </span>
      </div>
    </div>
  );
}

export type SidebarFooterProps = {
  isMobile: boolean;
  stats: SidebarStats;
  showStats: boolean;
};

export function SidebarFooter({
  isMobile,
  stats,
  showStats,
}: SidebarFooterProps) {
  if (!showStats) return null;

  return (
    <div className={cn("pt-3", isMobile ? "pb-1" : "pb-3")}>
      <StatsCard stats={stats} />
    </div>
  );
}
