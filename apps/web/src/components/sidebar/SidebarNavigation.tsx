import type { MouseEventHandler, ReactNode } from "react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import { IconUsers } from "@tabler/icons-react";
import { IconTeams, IconSettings } from "../icons/sidebar";
import type { NavGroup, NavItem } from "./types";
import {
  navHrefToPath,
  navViewFromPathname,
  railSectionFromPathname,
} from "./nav-config";
import { NavLink } from "./NavLink";
import { SkillsSidebarNav } from "./SkillsSidebarNav";
import { WikiSidebarNav } from "./WikiSidebarNav";
import { MemoriesSidebarNav } from "./MemoriesSidebarNav";
import { ActivitySidebarNav } from "./ActivitySidebarNav";
import { SettingsSidebar } from "./SettingsSidebar";
import { SharedLayoutBackground } from "./SharedLayoutBackground";
import { NavSection } from "./NavSection";

export type SidebarNavigationProps = {
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

const teamNavGroup: NavGroup = {
  title: "Team",
  icon: IconTeams,
  items: [
    { href: "/$profileId/team/members", label: "Members", icon: IconUsers },
    {
      href: "/$profileId/team/settings",
      label: "Team settings",
      icon: IconSettings,
    },
  ],
};

function NavGroupList({
  groups,
  isMobile,
  layoutId,
  slideDirection,
  renderItem,
}: {
  groups: { title: string; items: NavItem[] }[];
  isMobile: boolean;
  layoutId: string;
  slideDirection: number;
  renderItem: (item: NavItem) => ReactNode;
}) {
  return (
    <motion.nav
      className={cn(
        "flex-1 space-y-4 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: slideDirection }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <SharedLayoutBackground.Root layoutId={layoutId} className="space-y-4">
        {groups.map((group) => (
          <NavSection key={group.title} title={group.title} isIconOnly={false}>
            {group.items.map(renderItem)}
          </NavSection>
        ))}
      </SharedLayoutBackground.Root>
    </motion.nav>
  );
}

function TeamNav({
  pathname,
  profileId,
  isMobile,
  onNavigate,
}: {
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}) {
  function renderItem(item: NavItem) {
    const resolvedPath = navHrefToPath(item.href, profileId);
    const isActive =
      pathname === resolvedPath || pathname.startsWith(`${resolvedPath}/`);
    return (
      <SharedLayoutBackground.Item
        key={item.href}
        id={item.href}
        isActive={isActive}
      >
        <NavLink
          item={item}
          pathname={pathname}
          profileId={profileId}
          isIconOnly={false}
          unreadCount={0}
          proposalsCount={0}
          onNavigate={onNavigate}
        />
      </SharedLayoutBackground.Item>
    );
  }

  return (
    <NavGroupList
      groups={[teamNavGroup]}
      isMobile={isMobile}
      layoutId="team-nav"
      slideDirection={-12}
      renderItem={renderItem}
    />
  );
}

export function SidebarNavigation({
  pathname,
  profileId,
  isMobile,
  onNavigate,
}: SidebarNavigationProps) {
  const navView = navViewFromPathname(pathname);
  const section = railSectionFromPathname(pathname);

  if (navView === "settings") {
    return (
      <SettingsSidebar
        key="settings"
        pathname={pathname}
        isIconOnly={false}
        isMobile={isMobile}
        onNavigate={onNavigate}
      />
    );
  }
  if (navView === "skills") {
    return (
      <SkillsSidebarNav key="skills" isIconOnly={false} isMobile={isMobile} />
    );
  }
  if (navView === "wiki") {
    return <WikiSidebarNav key="wiki" isIconOnly={false} isMobile={isMobile} />;
  }
  if (navView === "memories") {
    return (
      <MemoriesSidebarNav
        key="memories"
        pathname={pathname}
        profileId={profileId}
        isMobile={isMobile}
        onNavigate={onNavigate}
      />
    );
  }
  if (navView === "activity") {
    return (
      <ActivitySidebarNav
        key="activity"
        pathname={pathname}
        profileId={profileId}
        isMobile={isMobile}
        onNavigate={onNavigate}
      />
    );
  }
  if (section === "team") {
    return (
      <TeamNav
        key="team"
        pathname={pathname}
        profileId={profileId}
        isMobile={isMobile}
        onNavigate={onNavigate}
      />
    );
  }
  return null;
}
