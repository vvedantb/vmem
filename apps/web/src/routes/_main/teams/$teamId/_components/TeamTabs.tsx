import {
  IconBrain,
  IconLayoutDashboard,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import type { Id } from "@vmem/backend";
import { RouteTabs, type RouteTabItem } from "@/components/RouteTabs";

interface TeamTabsProps {
  teamId: Id<"teams">;
  isOwner: boolean;
}

export function TeamTabs({ teamId, isOwner }: TeamTabsProps) {
  const tabs: RouteTabItem[] = [
    {
      value: "overview",
      to: "/teams/$teamId/overview",
      label: "Overview",
      icon: <IconLayoutDashboard size={16} />,
    },
    {
      value: "knowledge",
      to: "/teams/$teamId/knowledge",
      label: "Knowledge",
      icon: <IconBrain size={16} />,
    },
    {
      value: "members",
      to: "/teams/$teamId/members",
      label: "Members",
      icon: <IconUsers size={16} />,
    },
  ];

  if (isOwner) {
    tabs.push({
      value: "settings",
      to: "/teams/$teamId/settings",
      label: "Settings",
      icon: <IconSettings size={16} />,
    });
  }

  return (
    <RouteTabs
      linkParams={{ teamId }}
      tabs={tabs}
      getActiveValue={(matchRoute) =>
        matchRoute({ to: "/teams/$teamId/knowledge" })
          ? "knowledge"
          : matchRoute({ to: "/teams/$teamId/members" })
            ? "members"
            : matchRoute({ to: "/teams/$teamId/settings" })
              ? "settings"
              : "overview"
      }
    />
  );
}
