"use client";

import { Skeleton, cn } from "@vmem/ui";
import { IconChartBar } from "@tabler/icons-react";
import { SidebarUserMenu } from "./SidebarUserMenu";
import { SidebarIconTooltip } from "./SidebarIconTooltip";

// formats a number with abbreviated suffix (k, m, b) and 1 decimal place
function formatCompactNumber(num: number): string {
  if (num < 1000) return String(num);
  if (num < 1_000_000) {
    const value = num / 1000;
    return `${value % 1 === 0 ? String(value) : value.toFixed(1)}k`;
  }
  if (num < 1_000_000_000) {
    const value = num / 1_000_000;
    return `${value % 1 === 0 ? String(value) : value.toFixed(1)}m`;
  }
  const value = num / 1_000_000_000;
  return `${value % 1 === 0 ? String(value) : value.toFixed(1)}b`;
}

export interface SidebarStats {
  addedToday: number;
  total: number;
}

function todaySharePercent(addedToday: number, total: number): number {
  if (total <= 0 || addedToday <= 0) return 0;
  return Math.min(100, (addedToday / total) * 100);
}

function StatsCard({
  isIconOnly,
  stats,
}: {
  isIconOnly: boolean;
  stats: SidebarStats;
}) {
  const todayLabel = formatCompactNumber(stats.addedToday);
  const totalLabel = formatCompactNumber(stats.total);
  const sharePercent = todaySharePercent(stats.addedToday, stats.total);

  if (isIconOnly) {
    const statsLabel = `${todayLabel} today · ${totalLabel} total`;

    return (
      <div className="flex justify-center">
        <SidebarIconTooltip label={statsLabel} enabled>
          <div className="relative flex h-8 w-8 cursor-default items-center justify-center text-muted">
            <IconChartBar className="h-4 w-4" />
            {stats.addedToday > 0 ? (
              <span
                aria-hidden
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-foreground"
              />
            ) : null}
          </div>
        </SidebarIconTooltip>
      </div>
    );
  }

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
  isCollapsed: boolean;
  isMobile: boolean;
  isAuthLoading: boolean;
  stats: SidebarStats;
  showStats: boolean;
};

export function SidebarFooter({
  isCollapsed,
  isMobile,
  isAuthLoading,
  stats,
  showStats,
}: SidebarFooterProps) {
  const isIconOnly = !isMobile && isCollapsed;

  return (
    <div className={cn("space-y-4 pt-3")}>
      {showStats ? <StatsCard isIconOnly={isIconOnly} stats={stats} /> : null}

      <div className={cn(isMobile ? "pr-2" : "px-2")}>
        {isAuthLoading ? (
          <div className={cn(isIconOnly ? "flex justify-center py-1" : "")}>
            <Skeleton
              className={cn(
                isIconOnly ? "h-9 w-9 rounded-full" : "h-11 w-full rounded-lg",
              )}
            />
          </div>
        ) : (
          <SidebarUserMenu collapsed={isIconOnly} />
        )}
      </div>
    </div>
  );
}
