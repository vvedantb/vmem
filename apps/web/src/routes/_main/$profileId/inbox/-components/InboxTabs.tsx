import { IconChecklist, IconBell } from "@tabler/icons-react";
import { RouteTabs } from "@/components/RouteTabs";
import { useActiveProfile } from "@/components/workspace/active-profile";

export function InboxTabs() {
  const profile = useActiveProfile();
  return (
    <RouteTabs
      tabs={[
        {
          value: "proposals",
          to: "/$profileId/inbox/proposals",
          label: "Proposals",
          icon: <IconChecklist size={16} />,
        },
        {
          value: "notifications",
          to: "/$profileId/inbox/notifications",
          label: "Notifications",
          icon: <IconBell size={16} />,
        },
      ]}
      linkParams={{ profileId: profile._id }}
      getActiveValue={(matchRoute) =>
        matchRoute({ to: "/$profileId/inbox/notifications" })
          ? "notifications"
          : "proposals"
      }
    />
  );
}
