import { IconFileExport, IconShieldLock } from "@tabler/icons-react";
import { RouteTabs } from "@/components/shell/RouteTabs";

export function DataControlsTabs() {
  return (
    <RouteTabs
      tabs={[
        {
          value: "export",
          to: "/settings/data-controls/export",
          label: "Export",
          icon: <IconFileExport size={16} />,
        },
        {
          value: "danger",
          to: "/settings/data-controls/danger",
          label: "Data Control",
          icon: <IconShieldLock size={16} />,
        },
      ]}
      getActiveValue={(matchRoute) => {
        if (matchRoute({ to: "/settings/data-controls/danger" })) {
          return "danger";
        }
        return "export";
      }}
    />
  );
}
