"use client";

import {
  Separator,
  Button,
  Skeleton,
  cn,
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@vmem/ui";
import { UserButton } from "@clerk/clerk-react";

import { IconMoon, IconSun, IconChartBar } from "@tabler/icons-react";

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
    return (
      <div className="flex justify-center">
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className="glass-interactive flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground cursor-default">
              <IconChartBar className="h-4 w-4" />
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="right" align="center" className="w-auto p-3">
            <div className="flex items-baseline gap-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-instrumentSerif tabular-nums text-foreground">
                  {formatCompactNumber(stats.addedToday)}
                </span>
                <span className="text-[11px] text-muted-foreground/70">
                  today
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-instrumentSerif tabular-nums text-foreground">
                  {formatCompactNumber(stats.total)}
                </span>
                <span className="text-[11px] text-muted-foreground/70">
                  total
                </span>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>
    );
  }

  return (
    <div className="mx-2 flex items-baseline justify-between px-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-instrumentSerif tabular-nums text-foreground">
          {formatCompactNumber(stats.addedToday)}
        </span>
        <span className="text-[11px] text-muted-foreground/70">today</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-instrumentSerif tabular-nums text-foreground">
          {formatCompactNumber(stats.total)}
        </span>
        <span className="text-[11px] text-muted-foreground/70">total</span>
      </div>
    </div>
  );
}

export type SidebarFooterProps = {
  isCollapsed: boolean;
  isMobile: boolean;
  mounted: boolean;
  isDark: boolean;
  toggleTheme: () => void;
  isAuthLoading: boolean;
  stats: SidebarStats;
  showStats: boolean;
};

export function SidebarFooter({
  isCollapsed,
  isMobile,
  mounted,
  isDark,
  toggleTheme,
  isAuthLoading,
  stats,
  showStats,
}: SidebarFooterProps) {
  const isIconOnly = !isMobile && isCollapsed;

  return (
    <div className={cn("space-y-4 pt-3")}>
      {showStats ? <StatsCard isIconOnly={isIconOnly} stats={stats} /> : null}
      {showStats ? <Separator className="bg-border/45" /> : null}

      <div className={cn(isMobile ? "pr-2" : "px-2")}>
        {isAuthLoading ? (
          <div
            className={cn(
              isIconOnly
                ? "flex flex-col items-center gap-2 py-1"
                : "flex items-center justify-between",
            )}
          >
            <Skeleton className="h-10 w-10 rounded-full" />
            {mounted && <Skeleton className="h-8 w-8 rounded-lg" />}
          </div>
        ) : (
          <div
            className={cn(
              isIconOnly
                ? "flex flex-col items-center gap-2"
                : "flex items-center justify-between gap-2",
            )}
          >
            <UserButton
              showName={!isIconOnly}
              appearance={{
                elements: {
                  userButtonBox: isIconOnly
                    ? "flex justify-center"
                    : "flex w-full",
                  userButtonTrigger: `rounded-xl bg-transparent transition-colors hover:bg-card/60 focus:shadow-none ${
                    isIconOnly
                      ? "h-10 w-10 p-0"
                      : "h-10 w-full justify-start gap-0 px-2"
                  }`,
                  userButtonAvatarBox: "h-6 w-6 order-first",
                  userButtonOuterIdentifier:
                    "truncate text-sm font-medium text-foreground order-last -ml-2",
                  userButtonPopoverCard:
                    "glass-panel-strong text-popover-foreground !z-[300] pointer-events-auto",
                  userButtonPopoverActions: "!z-[300] pointer-events-auto",
                  userButtonPopoverActionButton:
                    "rounded-lg hover:bg-accent hover:text-accent-foreground",
                },
              }}
            />
            {mounted && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={toggleTheme}
                title={
                  isDark ? "Switch to light theme" : "Switch to dark theme"
                }
                aria-label={
                  isDark ? "Switch to light theme" : "Switch to dark theme"
                }
                className="glass-interactive shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
              >
                {isDark ? (
                  <IconMoon className="h-4 w-4" />
                ) : (
                  <IconSun className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
