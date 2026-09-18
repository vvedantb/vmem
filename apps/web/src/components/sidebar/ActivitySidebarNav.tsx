import type { MouseEventHandler } from "react";
import { IconActivity, IconReceipt2 } from "@tabler/icons-react";
import type { NavItem } from "./types";
import { StackedSidebarNav } from "./StackedSidebarNav";

const activityNavItems: NavItem[] = [
  { href: "/$profileId/activity/usage", label: "Usage", icon: IconReceipt2 },
  { href: "/$profileId/activity/events", label: "Events", icon: IconActivity },
];

type ActivitySidebarNavProps = {
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

export function ActivitySidebarNav({
  pathname,
  profileId,
  isMobile,
  onNavigate,
}: ActivitySidebarNavProps) {
  return (
    <StackedSidebarNav
      items={activityNavItems}
      pathname={pathname}
      profileId={profileId}
      isMobile={isMobile}
      onNavigate={onNavigate}
      layoutId="activity-nav"
      aria-label="Activity views"
    />
  );
}
