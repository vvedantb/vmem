import { Link, useMatchRoute, type LinkProps } from "@tanstack/react-router";
import { cn, Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import type { ReactNode } from "react";

interface RouteTabItem {
  value: string;
  to: LinkProps["to"];
  label: string;
  icon?: ReactNode;
}

type MatchRoute = ReturnType<typeof useMatchRoute>;

interface RouteTabsProps {
  tabs: RouteTabItem[];
  getActiveValue: (matchRoute: MatchRoute) => string;
  // passed to every tab `<Link>` (e.g. `$profileId`)
  linkParams?: LinkProps["params"];
  // preserved on tab navigation (e.g. current search params)
  search?: LinkProps["search"];
  // full-width segmented strip for nested sidebars (Eva SessionsListModeTabs)
  fullWidth?: boolean;
  "aria-label"?: string;
}

// URL-backed tab bar for route groups
export function RouteTabs({
  tabs,
  getActiveValue,
  linkParams,
  search,
  fullWidth = false,
  "aria-label": ariaLabel,
}: RouteTabsProps) {
  const matchRoute = useMatchRoute();
  const activeValue = getActiveValue(matchRoute);

  return (
    <Tabs value={activeValue} className={cn(fullWidth && "w-full")}>
      <TabsList className={cn(fullWidth && "w-full")} aria-label={ariaLabel}>
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            asChild
            className={cn(fullWidth && "min-w-0 flex-1 px-2 text-xs")}
          >
            <Link
              to={tab.to}
              params={linkParams}
              search={search}
              className="gap-1.5"
            >
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
