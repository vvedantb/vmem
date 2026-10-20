import type { MouseEventHandler, ReactNode } from "react";
import { motion } from "motion/react";
import {
  BuildingIcon,
  cn,
  motionDuration,
  motionEase,
  SettingsIcon,
} from "@vvedantb/ui";
import { IconUsers } from "@tabler/icons-react";
import type { NavGroup, NavItem } from "./types";
import { navViewFromPathname, railSectionFromPathname } from "./nav-config";
import { NavLink } from "./NavLink";
import { SkillsSidebarNav } from "./SkillsSidebarNav";
import { MemoriesSidebarNav } from "./MemoriesSidebarNav";
import { SettingsSidebar } from "./SettingsSidebar";
import { NavSection } from "./NavSection";

export type SidebarNavigationProps = {
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

const teamNavGroup: NavGroup = {
  title: "Team",
  icon: BuildingIcon,
  items: [
    { href: "/$profileId/team/members", label: "Members", icon: IconUsers },
    {
      href: "/$profileId/team/settings",
      label: "Team settings",
      icon: SettingsIcon,
    },
  ],
};

function NavGroupList({
  groups,
  isMobile,
  slideDirection,
  renderItem,
}: {
  groups: { title: string; items: NavItem[] }[];
  isMobile: boolean;
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
      {groups.map((group) => (
        <NavSection key={group.title} title={group.title} isIconOnly={false}>
          {group.items.map(renderItem)}
        </NavSection>
      ))}
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
    return (
      <NavLink
        key={item.href}
        item={item}
        pathname={pathname}
        profileId={profileId}
        isIconOnly={false}
        unreadCount={0}
        proposalsCount={0}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <NavGroupList
      groups={[teamNavGroup]}
      isMobile={isMobile}
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
