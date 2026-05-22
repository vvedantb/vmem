import { Link, useMatchRoute, type LinkProps } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, AnimatedTabLabel } from "@vmem/ui";
import type { ReactNode } from "react";

export interface RouteTabItem {
  value: string;
  to: LinkProps["to"];
  label: string;
  icon: ReactNode;
}

type MatchRoute = ReturnType<typeof useMatchRoute>;

interface RouteTabsProps {
  tabs: RouteTabItem[];
  getActiveValue: (matchRoute: MatchRoute) => string;
}

/**
 * URL-backed tab bar for route groups. Each tab is a real subroute wired as
 * a `<Link>`; active state is derived from `useMatchRoute`.
 */
export function RouteTabs({ tabs, getActiveValue }: RouteTabsProps) {
  const matchRoute = useMatchRoute();
  const activeValue = getActiveValue(matchRoute);

  return (
    <Tabs value={activeValue}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            <Link to={tab.to}>
              {tab.icon}
              <AnimatedTabLabel
                isActive={activeValue === tab.value}
                label={tab.label}
              />
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
