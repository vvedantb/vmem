import type { MouseEventHandler } from "react";
import { IconBell, IconChecklist } from "@tabler/icons-react";
import type { NavItem } from "./types";
import { StackedSidebarNav } from "./StackedSidebarNav";

const inboxNavItems: NavItem[] = [
  {
    href: "/$profileId/inbox/proposals",
    label: "Proposals",
    icon: IconChecklist,
  },
  {
    href: "/$profileId/inbox/notifications",
    label: "Notifications",
    icon: IconBell,
  },
];

type InboxSidebarNavProps = {
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

export function InboxSidebarNav({
  pathname,
  profileId,
  isMobile,
  onNavigate,
}: InboxSidebarNavProps) {
  return (
    <StackedSidebarNav
      items={inboxNavItems}
      pathname={pathname}
      profileId={profileId}
      isMobile={isMobile}
      onNavigate={onNavigate}
      layoutId="inbox-nav"
      aria-label="Inbox views"
    />
  );
}
