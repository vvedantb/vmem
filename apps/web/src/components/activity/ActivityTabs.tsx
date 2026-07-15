import { IconReceipt2, IconActivity } from "@tabler/icons-react";
import { RouteTabs } from "@/components/shell/RouteTabs";
import { useActiveProfile } from "@/components/workspace/active-profile";

export function ActivityTabs() {
  const profile = useActiveProfile();
  return (
    <RouteTabs
      tabs={[
        {
          value: "usage",
          to: "/$profileId/activity/usage",
          label: "Usage",
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
        matchRoute({ to: "/$profileId/activity/events" }) ? "events" : "usage"
      }
    />
  );
}
