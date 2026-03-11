"use client";

import { Separator, Button, Skeleton, cn } from "@vmem/ui";
import { UserButton } from "@clerk/nextjs";
import { IconMoon, IconSun } from "@tabler/icons-react";

function StatsCard({ isIconOnly }: { isIconOnly: boolean }) {
  const memoriesAdded = 12;
  const memoriesRetrieved = 47;

  if (isIconOnly) {
    return (
      <div className="mx-auto flex w-fit flex-col items-center gap-1.5 rounded-xl bg-card/40 px-2 py-2.5 ring-1 ring-border/30">
        <span className="text-sm font-semibold text-foreground">
          {memoriesAdded}
        </span>
        <Separator className="w-4 bg-border/40" />
        <span className="text-sm font-semibold text-foreground">
          {memoriesRetrieved}
        </span>
      </div>
    );
  }

  return (
    <div className="mx-2 rounded-xl bg-card/40 px-3.5 py-3 ring-1 ring-border/30">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {"Today\u2019s Stats"}
      </p>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-lg font-semibold leading-tight text-foreground">
            {memoriesAdded}
          </span>
          <span className="text-[11px] text-muted-foreground">Added</span>
        </div>
        <Separator orientation="vertical" className="h-8 bg-border/40" />
        <div className="flex flex-col">
          <span className="text-lg font-semibold leading-tight text-foreground">
            {memoriesRetrieved}
          </span>
          <span className="text-[11px] text-muted-foreground">Retrieved</span>
        </div>
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
