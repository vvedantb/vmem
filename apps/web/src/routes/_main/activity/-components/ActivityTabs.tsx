import { IconReceipt2, IconActivity } from "@tabler/icons-react";
import { RouteTabs } from "@/components/RouteTabs";

export function ActivityTabs() {
  return (
    <RouteTabs
      tabs={[
        {
          value: "ai-logs",
          to: "/activity/ai-logs",
          label: "AI Logs",
          icon: <IconReceipt2 size={16} />,
        },
        {
          value: "events",
          to: "/activity/events",
          label: "Events",
          icon: <IconActivity size={16} />,
        },
      ]}
      getActiveValue={(matchRoute) =>
        matchRoute({ to: "/activity/events" }) ? "events" : "ai-logs"
      }
    />
  );
}
