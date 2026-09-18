import type { MouseEventHandler } from "react";
import { IconActivity, IconReceipt2 } from "@tabler/icons-react";
import type { NavItem } from "./types";
import { StackedSidebarNav } from "./StackedSidebarNav";

const homeNavItems: NavItem[] = [
  { href: "/$profileId/activity/usage", label: "Usage", icon: IconReceipt2 },
  { href: "/$profileId/activity/events", label: "Events", icon: IconActivity },
];

type HomeSidebarNavProps = {
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

export function HomeSidebarNav({
  pathname,
  profileId,
  isMobile,
  onNavigate,
}: HomeSidebarNavProps) {
  return (
    <StackedSidebarNav
      items={homeNavItems}
      pathname={pathname}
      profileId={profileId}
      isMobile={isMobile}
      onNavigate={onNavigate}
      layoutId="home-nav"
      aria-label="Home views"
    />
  );
}
