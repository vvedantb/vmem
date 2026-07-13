import type { MouseEventHandler } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import { IconChevronRight, IconUsers } from "@tabler/icons-react";
import { IconTeams, IconSettings } from "../sidebar-icons";
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
  // Workspace routes carry the profile id as their first segment — strip it
  // before matching sections.
  const sub = pathname.replace(/^\/[^/]+/, "");
  if (sub.startsWith("/skills")) return "skills";
  if (sub.startsWith("/wiki")) return "wiki";
  if (sub.startsWith("/codebases")) return "codebases";
  return "main";
}

export type SidebarNavigationProps = {
  pathname: string;
  /** Active workspace id for resolving workspace-scoped nav hrefs. */
  profileId: string | undefined;
  /** Team workspaces get an extra "Team" nav group (members / settings). */
  isTeamWorkspace: boolean;
  unreadCount: number;
  proposalsCount: number;
  isCollapsed: boolean;
  isMobile: boolean;
  navView: SidebarNavView;
  onNavViewChange: (view: SidebarNavView) => void;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

/** Extra nav group shown only when the active workspace belongs to a team. */
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

function SubSidebarNavButton({
  item,
  isActive,
  isIconOnly,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  isIconOnly: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <SidebarIconTooltip label={item.label} enabled={isIconOnly}>
      <Button
        type="button"
        variant="ghost"
        onClick={onClick}
        className={cn(
          "group relative h-auto w-full justify-start rounded-lg text-sm font-medium tracking-normal transition-colors duration-200 ease-smooth",
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
              className="min-w-0 flex-1 text-left"
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
        {!isIconOnly ? (
          <IconChevronRight
            size={16}
            stroke={2}
            aria-hidden
            className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
          />
        ) : null}
      </Button>
    </SidebarIconTooltip>
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
  onSettingsClick,
  onSkillsClick,
  onWikiClick,
  onCodebasesClick,
}: {
  pathname: string;
  profileId: string | undefined;
  isTeamWorkspace: boolean;
  unreadCount: number;
  proposalsCount: number;
  isIconOnly: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  onSettingsClick: () => void;
  onSkillsClick: () => void;
  onWikiClick: () => void;
  onCodebasesClick: () => void;
}) {
  const groups = isTeamWorkspace ? [...navGroups, teamNavGroup] : navGroups;
  return (
    <motion.nav
      className={cn(
        "flex-1 space-y-4 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
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
                  const onClick =
                    item.href === "/$profileId/skills"
                      ? onSkillsClick
                      : item.href === "/$profileId/wiki"
                        ? onWikiClick
                        : item.href === "/$profileId/codebases"
                          ? onCodebasesClick
                          : onSettingsClick;
                  return (
                    <SharedLayoutBackground.Item
                      key={item.href}
                      id={item.href}
                      isActive={isActive}
                    >
                      <SubSidebarNavButton
                        item={item}
                        isActive={isActive}
                        isIconOnly={isIconOnly}
                        onClick={onClick}
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
      exit={{ opacity: 0, x: 12 }}
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
  navView,
  onNavViewChange,
  onNavigate,
}: SidebarNavigationProps) {
  const isIconOnly = !isMobile && isCollapsed;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {navView === "settings" ? (
        <SettingsNav
          key="settings"
          pathname={pathname}
          isIconOnly={isIconOnly}
          isMobile={isMobile}
          onNavigate={onNavigate}
        />
      ) : navView === "skills" ? (
        <SkillsSidebarNav
          key="skills"
          isIconOnly={isIconOnly}
          isMobile={isMobile}
        />
      ) : navView === "wiki" ? (
        <WikiSidebarNav
          key="wiki"
          isIconOnly={isIconOnly}
          isMobile={isMobile}
        />
      ) : navView === "codebases" ? (
        <CodebasesSidebarNav
          key="codebases"
          isIconOnly={isIconOnly}
          isMobile={isMobile}
        />
      ) : (
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
          onSettingsClick={() => onNavViewChange("settings")}
          onSkillsClick={() => onNavViewChange("skills")}
          onWikiClick={() => onNavViewChange("wiki")}
          onCodebasesClick={() => onNavViewChange("codebases")}
        />
      )}
    </AnimatePresence>
  );
}
