import { IconKey, IconChartBar } from "@tabler/icons-react";
import { RouteTabs } from "@/components/RouteTabs";

export function ApiTabs() {
  return (
    <RouteTabs
      tabs={[
        {
          value: "keys",
          to: "/settings/api/keys",
          label: "Keys",
          icon: <IconKey size={16} />,
        },
        {
          value: "usage",
          to: "/settings/api/usage",
          label: "Usage",
          icon: <IconChartBar size={16} />,
        },
      ]}
      getActiveValue={(matchRoute) =>
        matchRoute({ to: "/settings/api/usage" }) ? "usage" : "keys"
      }
    />
  );
}
