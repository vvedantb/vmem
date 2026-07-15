import {
  IconFileImport,
  IconFileExport,
  IconShieldLock,
} from "@tabler/icons-react";
import { RouteTabs } from "@/components/shell/RouteTabs";

export function DataControlsTabs() {
  return (
    <RouteTabs
      tabs={[
        {
          value: "import",
          to: "/settings/data-controls/import",
          label: "Import",
          icon: <IconFileImport size={16} />,
        },
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
        if (matchRoute({ to: "/settings/data-controls/export" })) {
          return "export";
        }
        if (matchRoute({ to: "/settings/data-controls/danger" })) {
          return "danger";
        }
        return "import";
      }}
    />
  );
}
