import { Link, useMatchRoute, type LinkProps } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@vv/ui";
import type { ReactNode } from "react";
import { VIEW_TRANSITION_TARGET } from "@/lib/view-transitions";

interface RouteTabItem {
  value: string;
  to: LinkProps["to"];
  label: string;
  icon?: ReactNode;
  // trailing count or status after the label (e.g. Inbox pending total)
  badge?: ReactNode;
}

type MatchRoute = ReturnType<typeof useMatchRoute>;

interface RouteTabsProps {
  tabs: RouteTabItem[];
  getActiveValue: (matchRoute: MatchRoute) => string;
  // passed to every tab `<Link>` (e.g. `$profileId`)
  linkParams?: LinkProps["params"];
  // preserved on tab navigation (e.g. current search params)
  search?: LinkProps["search"];
}

// URL-backed tab bar for route groups
export function RouteTabs({
  tabs,
  getActiveValue,
  linkParams,
  search,
}: RouteTabsProps) {
  const matchRoute = useMatchRoute();
  const activeValue = getActiveValue(matchRoute);

  return (
    <Tabs value={activeValue}>
      <TabsList data-vt={VIEW_TRANSITION_TARGET.routeTabs}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            <Link
              to={tab.to}
              params={linkParams}
              search={search}
              className="gap-1.5"
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
