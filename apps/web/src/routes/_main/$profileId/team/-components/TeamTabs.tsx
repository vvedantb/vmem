import { IconUsers, IconSettings } from "@tabler/icons-react";
import { RouteTabs } from "@/components/shell/RouteTabs";
import { useTeamWorkspace } from "@/components/teams/team-context";
import { useActiveProfile } from "@/components/workspace/active-profile";

const MEMBERS_TAB = {
  value: "members",
  to: "/$profileId/team/members" as const,
  label: "Members",
  icon: <IconUsers size={16} />,
};

const SETTINGS_TAB = {
  value: "settings",
  to: "/$profileId/team/settings" as const,
  label: "Settings",
  icon: <IconSettings size={16} />,
};

type TeamTab = typeof MEMBERS_TAB | typeof SETTINGS_TAB;

function TeamTabsBase({ tabs }: { tabs: TeamTab[] }) {
  const profile = useActiveProfile();
  return (
    <RouteTabs
      tabs={tabs}
      linkParams={{ profileId: profile._id }}
      getActiveValue={(matchRoute) =>
        matchRoute({ to: "/$profileId/team/settings" }) ? "settings" : "members"
      }
    />
  );
}

export function OwnerTeamTabs() {
  return <TeamTabsBase tabs={[MEMBERS_TAB, SETTINGS_TAB]} />;
}

export function MemberTeamTabs() {
  return <TeamTabsBase tabs={[MEMBERS_TAB]} />;
}

export function TeamWorkspaceTabs() {
  const { meta } = useTeamWorkspace();
  if (meta.isOwner) {
    return <OwnerTeamTabs />;
  }
  return <MemberTeamTabs />;
}
