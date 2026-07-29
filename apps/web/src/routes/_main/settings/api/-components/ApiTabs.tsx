import type { useMatchRoute } from "@tanstack/react-router";
import { IconKey, IconChartBar } from "@tabler/icons-react";
import { RouteTabs } from "@/components/shell/RouteTabs";

export type ApiTab = "usage" | "keys";

type MatchRoute = ReturnType<typeof useMatchRoute>;

export function getActiveApiTab(matchRoute: MatchRoute): ApiTab {
  return matchRoute({ to: "/settings/api/usage" }) ? "usage" : "keys";
}

export function ApiTabs() {
  return (
    <RouteTabs
      tabs={[
        {
          value: "usage",
          to: "/settings/api/usage",
          label: "Usage",
          icon: <IconChartBar size={16} />,
        },
        {
          value: "keys",
          to: "/settings/api/keys",
          label: "Keys",
          icon: <IconKey size={16} />,
        },
      ]}
      getActiveValue={getActiveApiTab}
    />
  );
}
