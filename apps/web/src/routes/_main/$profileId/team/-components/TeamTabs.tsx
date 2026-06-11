import { IconUsers, IconSettings } from "@tabler/icons-react";
import { RouteTabs } from "@/components/RouteTabs";
import { useActiveProfile } from "@/components/workspace/active-profile";

export function TeamTabs({ isOwner }: { isOwner: boolean }) {
  const profile = useActiveProfile();
  return (
    <RouteTabs
      tabs={[
        {
          value: "members",
          to: "/$profileId/team/members",
          label: "Members",
          icon: <IconUsers size={16} />,
        },
        ...(isOwner
          ? [
              {
                value: "settings",
                to: "/$profileId/team/settings",
                label: "Settings",
                icon: <IconSettings size={16} />,
              } as const,
            ]
          : []),
      ]}
      linkParams={{ profileId: profile._id }}
      getActiveValue={(matchRoute) =>
        matchRoute({ to: "/$profileId/team/settings" }) ? "settings" : "members"
      }
    />
  );
}
