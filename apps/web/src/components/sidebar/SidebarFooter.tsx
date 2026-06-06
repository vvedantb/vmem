"use client";

import { Separator, Skeleton, cn } from "@vmem/ui";
import { IconChartBar } from "@tabler/icons-react";
import { SidebarUserMenu } from "./SidebarUserMenu";
import { SidebarIconTooltip } from "./SidebarIconTooltip";

/**
 * Formats a number with abbreviated suffix (k, m, b) and 1 decimal place.
 * Numbers under 1000 are displayed as-is.
 */
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

function StatsCard({
  isIconOnly,
  stats,
}: {
  isIconOnly: boolean;
  stats: SidebarStats;
}) {
  if (isIconOnly) {
    const statsLabel = `${formatCompactNumber(stats.addedToday)} today · ${formatCompactNumber(stats.total)} total`;

    return (
      <div className="flex justify-center">
        <SidebarIconTooltip label={statsLabel} enabled>
          <div className="flex h-8 w-8 cursor-default items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-tertiary/50 hover:text-foreground">
            <IconChartBar className="h-4 w-4" />
          </div>
        </SidebarIconTooltip>
      </div>
    );
  }

  return (
    <div className="mx-2 flex items-baseline justify-between px-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-instrumentSerif tabular-nums text-foreground">
          {formatCompactNumber(stats.addedToday)}
        </span>
        <span className="text-[11px] text-muted/70">today</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-instrumentSerif tabular-nums text-foreground">
          {formatCompactNumber(stats.total)}
        </span>
        <span className="text-[11px] text-muted/70">total</span>
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
      {showStats ? <Separator /> : null}

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
