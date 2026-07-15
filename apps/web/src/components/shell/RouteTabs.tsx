import { Link, useMatchRoute, type LinkProps } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import type { ReactNode } from "react";

interface RouteTabItem {
  value: string;
  to: LinkProps["to"];
  label: string;
  icon: ReactNode;
}

type MatchRoute = ReturnType<typeof useMatchRoute>;

interface RouteTabsProps {
  tabs: RouteTabItem[];
  getActiveValue: (matchRoute: MatchRoute) => string;
  // passed to every tab `<Link>` (e.g
  linkParams?: LinkProps["params"];
  // preserved on tab navigation (e.g
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
      <TabsList>
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
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
