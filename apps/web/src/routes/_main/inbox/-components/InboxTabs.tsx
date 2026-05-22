import { IconChecklist, IconBell } from "@tabler/icons-react";
import { RouteTabs } from "@/components/RouteTabs";

export function InboxTabs() {
  return (
    <RouteTabs
      tabs={[
        {
          value: "proposals",
          to: "/inbox/proposals",
          label: "Proposals",
          icon: <IconChecklist size={16} />,
        },
        {
          value: "notifications",
          to: "/inbox/notifications",
          label: "Notifications",
          icon: <IconBell size={16} />,
        },
      ]}
      getActiveValue={(matchRoute) =>
        matchRoute({ to: "/inbox/notifications" })
          ? "notifications"
          : "proposals"
      }
    />
  );
}
