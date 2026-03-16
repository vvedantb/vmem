"use client";

import { Separator, Button, Skeleton, cn } from "@vmem/ui";
import { UserButton } from "@clerk/nextjs";
import { IconMoon, IconSun } from "@tabler/icons-react";

function StatsCard({ isIconOnly }: { isIconOnly: boolean }) {
  const memoriesAdded = 12;
  const memoriesRetrieved = 47;

  if (isIconOnly) {
    return (
      <div className="mx-auto flex w-fit flex-col items-center gap-0.5 px-2 py-1">
        <span className="text-xl font-instrumentSerif tabular-nums text-foreground">
          {memoriesAdded}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
          add
        </span>
        <span className="mt-1 text-xl font-instrumentSerif tabular-nums text-foreground">
          {memoriesRetrieved}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
          ret
        </span>
      </div>
    );
  }

  return (
    <div className="mx-2 flex items-baseline justify-between px-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-instrumentSerif tabular-nums text-foreground">
          {memoriesAdded}
        </span>
        <span className="text-[11px] text-muted-foreground/70">added</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-instrumentSerif tabular-nums text-foreground">
          {memoriesRetrieved}
        </span>
        <span className="text-[11px] text-muted-foreground/70">retrieved</span>
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
};

export function SidebarFooter({
  isCollapsed,
  isMobile,
  mounted,
  isDark,
  toggleTheme,
  isAuthLoading,
}: SidebarFooterProps) {
  const isIconOnly = !isMobile && isCollapsed;

  return (
    <div className={cn("space-y-4 pt-3")}>
      <StatsCard isIconOnly={isIconOnly} />
      <Separator className="bg-border/45" />

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
                      : "h-11 w-full justify-start gap-2.5 px-2.5"
                  }`,
                  userButtonAvatarBox: "h-8 w-8",
                  userButtonOuterIdentifier:
                    "truncate text-sm font-medium text-foreground",
                  userButtonPopoverCard:
                    "glass-panel-strong text-popover-foreground",
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
