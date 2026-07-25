import type { MouseEventHandler } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import { IconUsers } from "@tabler/icons-react";
import { IconTeams, IconSettings } from "../icons/sidebar";
import type { NavGroup, NavItem } from "./types";
import { navGroups, navHrefToPath, settingsNavGroups } from "./nav-config";
import { NavLink } from "./NavLink";
import { SidebarIconTooltip } from "./SidebarIconTooltip";
import { SkillsSidebarNav } from "./SkillsSidebarNav";
import { WikiSidebarNav } from "./WikiSidebarNav";
import { CodebasesSidebarNav } from "./CodebasesSidebarNav";
import { SharedLayoutBackground } from "./SharedLayoutBackground";
import { NavSection } from "./NavSection";
import { sidebarNavRowClass, sidebarNavLinkTextClass } from "./sidebar-nav-row";

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
  // workspace routes carry the profile id as their first segment — strip it
  // before matching sections
  const sub = pathname.replace(/^\/[^/]+/, "");
  if (sub.startsWith("/skills")) return "skills";
  if (sub.startsWith("/wiki")) return "wiki";
  if (sub.startsWith("/codebases")) return "codebases";
  return "main";
}

export type SidebarNavigationProps = {
  pathname: string;
  // active workspace id for resolving workspace-scoped nav hrefs
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

function SubSidebarNavLink({
  item,
  pathname,
  profileId,
  isIconOnly,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  profileId: string | undefined;
  isIconOnly: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <NavLink
      item={item}
      pathname={pathname}
      profileId={profileId}
      isIconOnly={isIconOnly}
      unreadCount={0}
      proposalsCount={0}
      showChevron
      onNavigate={onNavigate}
    />
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
  return (
    <motion.nav
      className={cn(
        "flex-1 space-y-4 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <SharedLayoutBackground.Root layoutId="main-nav" className="space-y-4">
        {groups.map((group) => (
          <NavSection
            key={group.title}
            title={group.title}
            isIconOnly={isIconOnly}
          >
            <div className="space-y-1">
              {group.items.map((item) => {
                const resolvedPath = navHrefToPath(item.href, profileId);
                const isActive =
                  pathname === resolvedPath ||
                  pathname.startsWith(resolvedPath + "/");
                if (isSubSidebarHref(item.href)) {
                  return (
                    <SharedLayoutBackground.Item
                      key={item.href}
                      id={item.href}
                      isActive={isActive}
                    >
                      <SubSidebarNavLink
                        item={item}
                        pathname={pathname}
                        profileId={profileId}
                        isIconOnly={isIconOnly}
                        onNavigate={onNavigate}
                      />
                    </SharedLayoutBackground.Item>
                  );
                }
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
                      onNavigate={onNavigate}
                    />
                  </SharedLayoutBackground.Item>
                );
              })}
            </div>
          </NavSection>
        ))}
      </SharedLayoutBackground.Root>
    </motion.nav>
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
  return (
    <motion.nav
      className={cn(
        "flex-1 space-y-4 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <SharedLayoutBackground.Root
        layoutId="settings-nav"
        className="space-y-4"
      >
        {settingsNavGroups.map((group) => (
          <NavSection
            key={group.title}
            title={group.title}
            isIconOnly={isIconOnly}
          >
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <SharedLayoutBackground.Item
                    key={item.href}
                    id={item.href}
                    isActive={isActive}
                  >
                    <SidebarIconTooltip label={item.label} enabled={isIconOnly}>
                      <Link
                        to={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "group relative flex w-full items-center rounded-lg text-sm font-medium tracking-normal transition-colors duration-200 ease-smooth",
                          sidebarNavRowClass(isIconOnly),
                          sidebarNavLinkTextClass(isActive),
                        )}
                      >
                        <span className="flex h-5 w-5 items-center justify-center text-current">
                          <Icon size={18} stroke={1.7} />
                        </span>
                        <AnimatePresence initial={false}>
                          {!isIconOnly ? (
                            <motion.span
                              key={`${item.href}-label`}
                              className="flex-1"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{
                                duration: motionDuration.fast,
                                ease: motionEase,
                              }}
                            >
                              {item.label}
                            </motion.span>
                          ) : null}
                        </AnimatePresence>
                      </Link>
                    </SidebarIconTooltip>
                  </SharedLayoutBackground.Item>
                );
              })}
            </div>
          </NavSection>
        ))}
      </SharedLayoutBackground.Root>
    </motion.nav>
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

  // Enter-only keyed remount — no AnimatePresence mode="wait". Wait+exit can
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
