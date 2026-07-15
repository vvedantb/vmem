import { IconReceipt2, IconActivity } from "@tabler/icons-react";
import { RouteTabs } from "@/components/RouteTabs";
import { useActiveProfile } from "@/components/workspace/active-profile";

export function ActivityTabs() {
  const profile = useActiveProfile();
  return (
    <RouteTabs
      tabs={[
        {
          value: "ai-logs",
          to: "/$profileId/activity/ai-logs",
          label: "AI Logs",
          icon: <IconReceipt2 size={16} />,
        },
        {
          value: "events",
          to: "/$profileId/activity/events",
          label: "Events",
          icon: <IconActivity size={16} />,
        },
      ]}
      linkParams={{ profileId: profile._id }}
      getActiveValue={(matchRoute) =>
        matchRoute({ to: "/$profileId/activity/events" }) ? "events" : "ai-logs"
      }
    />
  );
}
