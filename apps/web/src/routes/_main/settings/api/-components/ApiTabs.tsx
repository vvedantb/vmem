import { useLocation } from "@tanstack/react-router";
import { IconKey, IconChartBar } from "@tabler/icons-react";
import { RouteTabs } from "@/components/shell/RouteTabs";

export type ApiTab = "usage" | "keys";

export function apiTabFromPathname(pathname: string): ApiTab {
  return /\/settings\/api\/keys\/?$/.test(pathname) ? "keys" : "usage";
}

export function ApiTabs() {
  const pathname = useLocation({ select: (location) => location.pathname });
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
      getActiveValue={() => apiTabFromPathname(pathname)}
    />
  );
}
