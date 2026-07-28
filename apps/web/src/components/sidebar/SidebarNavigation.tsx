import type { MouseEventHandler, ReactNode } from "react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import { IconUsers } from "@tabler/icons-react";
import { IconTeams, IconSettings } from "../icons/sidebar";
import type { NavGroup, NavItem } from "./types";
import { navGroups, navHrefToPath, settingsNavGroups } from "./nav-config";
import { NavLink } from "./NavLink";
import { SkillsSidebarNav } from "./SkillsSidebarNav";
import { WikiSidebarNav } from "./WikiSidebarNav";
import { CodebasesSidebarNav } from "./CodebasesSidebarNav";
import { SharedLayoutBackground } from "./SharedLayoutBackground";
import { NavSection } from "./NavSection";

export type SidebarNavView =
  | "main"
  | "settings"
  | "skills"
  | "wiki"
  | "codebases";

const subSidebarHrefs = [
  "/$profileId/skills",
  "/settings",
  "/$profileId/wiki",
  "/$profileId/codebases",
] as const;

type SubSidebarHref = (typeof subSidebarHrefs)[number];

function isSubSidebarHref(href: string): href is SubSidebarHref {
  return subSidebarHrefs.some((subHref) => subHref === href);
}

export function navViewFromPathname(pathname: string): SidebarNavView {
  if (pathname.startsWith("/settings")) return "settings";
  // workspace routes carry the profile id as their first segment strip it
  // before matching sections
  const sub = pathname.replace(/^\/[^/]+/, "");
  if (sub.startsWith("/skills")) return "skills";
  if (sub.startsWith("/wiki")) return "wiki";
  if (sub.startsWith("/codebases")) return "codebases";
  return "main";
}

export type SidebarNavigationProps = {
  pathname: string;
  // active workspace id for resolving workspace scoped nav hrefs
  profileId: string | undefined;
  // team workspaces get an extra "Team" nav group (members / settings)
  isTeamWorkspace: boolean;
  unreadCount: number;
  proposalsCount: number;
  isCollapsed: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

// extra nav group shown only when the active workspace belongs to a team
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

// shared shell for MainNav/SettingsNav slide in nav + shared layout pill +
// collapsible sections. Per item rendering (incl. the active highlight check
// feeding SharedLayoutBackground.Item) is the caller's concern.
function NavGroupList({
  groups,
  isIconOnly,
  isMobile,
  layoutId,
  slideDirection,
  renderItem,
}: {
  groups: { title: string; items: NavItem[] }[];
  isIconOnly: boolean;
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
          <NavSection
            key={group.title}
            title={group.title}
            isIconOnly={isIconOnly}
          >
            <div className="space-y-1">{group.items.map(renderItem)}</div>
          </NavSection>
        ))}
      </SharedLayoutBackground.Root>
    </motion.nav>
  );
}

function MainNav({
  pathname,
  profileId,
  isTeamWorkspace,
  unreadCount,
  proposalsCount,
  isIconOnly,
  isMobile,
  onNavigate,
}: {
  pathname: string;
  profileId: string | undefined;
  isTeamWorkspace: boolean;
  unreadCount: number;
  proposalsCount: number;
  isIconOnly: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const groups = isTeamWorkspace
    ? [...navGroups.slice(0, 1), teamNavGroup, ...navGroups.slice(1)]
    : navGroups;

  function renderItem(item: NavItem) {
    const resolvedPath = navHrefToPath(item.href, profileId);
    const isActive =
      pathname === resolvedPath || pathname.startsWith(resolvedPath + "/");
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
          isIconOnly={isIconOnly}
          unreadCount={unreadCount}
          proposalsCount={proposalsCount}
          showChevron={isSubSidebarHref(item.href)}
          onNavigate={onNavigate}
        />
      </SharedLayoutBackground.Item>
    );
  }

  return (
    <NavGroupList
      groups={groups}
      isIconOnly={isIconOnly}
      isMobile={isMobile}
      layoutId="main-nav"
      slideDirection={-12}
      renderItem={renderItem}
    />
  );
}

function SettingsNav({
  pathname,
  isIconOnly,
  isMobile,
  onNavigate,
}: {
  pathname: string;
  isIconOnly: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}) {
  function renderItem(item: NavItem) {
    const isActive =
      pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <SharedLayoutBackground.Item
        key={item.href}
        id={item.href}
        isActive={isActive}
      >
        <NavLink
          item={item}
          pathname={pathname}
          profileId={undefined}
          isIconOnly={isIconOnly}
          unreadCount={0}
          proposalsCount={0}
          onNavigate={onNavigate}
        />
      </SharedLayoutBackground.Item>
    );
  }

  return (
    <NavGroupList
      groups={settingsNavGroups}
      isIconOnly={isIconOnly}
      isMobile={isMobile}
      layoutId="settings-nav"
      slideDirection={12}
      renderItem={renderItem}
    />
  );
}

export function SidebarNavigation({
  pathname,
  profileId,
  isTeamWorkspace,
  unreadCount,
  proposalsCount,
  isCollapsed,
  isMobile,
  onNavigate,
}: SidebarNavigationProps) {
  const isIconOnly = !isMobile && isCollapsed;
  const navView = navViewFromPathname(pathname);

  // enter only keyed remount no AnimatePresence mode="wait". Wait+exit can
  // strand the incoming panel at opacity 0 if a Convex re-render lands mid-exit.
  if (navView === "settings") {
    return (
      <SettingsNav
        key="settings"
        pathname={pathname}
        isIconOnly={isIconOnly}
        isMobile={isMobile}
        onNavigate={onNavigate}
      />
    );
  }
  if (navView === "skills") {
    return (
      <SkillsSidebarNav
        key="skills"
        isIconOnly={isIconOnly}
        isMobile={isMobile}
      />
    );
  }
  if (navView === "wiki") {
    return (
      <WikiSidebarNav key="wiki" isIconOnly={isIconOnly} isMobile={isMobile} />
    );
  }
  if (navView === "codebases") {
    return (
      <CodebasesSidebarNav
        key="codebases"
        isIconOnly={isIconOnly}
        isMobile={isMobile}
      />
    );
  }
  return (
    <MainNav
      key="main"
      pathname={pathname}
      profileId={profileId}
      isTeamWorkspace={isTeamWorkspace}
      unreadCount={unreadCount}
      proposalsCount={proposalsCount}
      isIconOnly={isIconOnly}
      isMobile={isMobile}
      onNavigate={onNavigate}
    />
  );
}
