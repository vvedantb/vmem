import { type MouseEventHandler } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Separator, cn, motionDuration, motionEase } from "@vmem/ui";
import { IconChevronRight } from "@tabler/icons-react";
import type { NavIcon, NavItem } from "./types";
import { navGroups, settingsNavGroups } from "./nav-config";
import { NavLink } from "./NavLink";
import { SkillsSidebarNav } from "./SkillsSidebarNav";
import { WikiSidebarNav } from "./WikiSidebarNav";
import { TeamsSidebarNav } from "./TeamsSidebarNav";
import { CodebasesSidebarNav } from "./CodebasesSidebarNav";

export type SidebarNavView =
  | "main"
  | "settings"
  | "skills"
  | "wiki"
  | "teams"
  | "codebases";

const subSidebarHrefs = [
  "/skills",
  "/settings",
  "/wiki",
  "/teams",
  "/codebases",
] as const;

type SubSidebarHref = (typeof subSidebarHrefs)[number];

function isSubSidebarHref(href: string): href is SubSidebarHref {
  return subSidebarHrefs.some((subHref) => subHref === href);
}

export function navViewFromPathname(pathname: string): SidebarNavView {
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/skills")) return "skills";
  if (pathname.startsWith("/wiki")) return "wiki";
  if (pathname.startsWith("/teams")) return "teams";
  if (pathname.startsWith("/codebases")) return "codebases";
  return "main";
}

export type SidebarNavigationProps = {
  pathname: string;
  unreadCount: number;
  proposalsCount: number;
  isCollapsed: boolean;
  isMobile: boolean;
  navView: SidebarNavView;
  onNavViewChange: (view: SidebarNavView) => void;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

function SubSidebarNavButton({
  item,
  isActive,
  isIconOnly,
  isMobile,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  isIconOnly: boolean;
  isMobile: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon as NavIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      title={isIconOnly ? item.label : undefined}
      className={cn(
        "group relative flex w-full items-center rounded-lg text-sm font-medium tracking-normal transition-[transform,background-color,color] duration-200 ease-smooth active:scale-[0.98]",
        isIconOnly ? "justify-center px-2 py-2.5" : "gap-3 px-3.5",
        isMobile ? "py-3.5" : "py-2.5",
        isActive
          ? "bg-surface-tertiary text-foreground"
          : "text-muted hover:bg-surface-tertiary/50 hover:text-foreground",
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
    </button>
  );
}

function MainNav({
  pathname,
  unreadCount,
  proposalsCount,
  isIconOnly,
  isMobile,
  onNavigate,
  onSettingsClick,
  onSkillsClick,
  onWikiClick,
  onTeamsClick,
  onCodebasesClick,
}: {
  pathname: string;
  unreadCount: number;
  proposalsCount: number;
  isIconOnly: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  onSettingsClick: () => void;
  onSkillsClick: () => void;
  onWikiClick: () => void;
  onTeamsClick: () => void;
  onCodebasesClick: () => void;
}) {
  return (
    <motion.nav
      className={cn(
        "flex-1 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      {navGroups.map((group) => {
        const GroupIcon = group.icon as NavIcon;
        return (
          <div key={group.title} className="px-1 mb-4">
            {!isIconOnly ? (
              <div className="flex items-center gap-2 px-3.5 mb-2">
                <GroupIcon
                  size={14}
                  stroke={1.8}
                  className="shrink-0 text-muted/70"
                />
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted/70">
                  {group.title}
                </span>
                <Separator className="flex-1" />
              </div>
            ) : (
              <div className="flex justify-center mb-2">
                <Separator className="w-6" />
              </div>
            )}
            <ul className={cn("space-y-1", !isIconOnly && "pl-3")}>
              {group.items.map((item) => {
                if (isSubSidebarHref(item.href)) {
                  const isActive = pathname.startsWith(item.href);
                  const onClick =
                    item.href === "/skills"
                      ? onSkillsClick
                      : item.href === "/wiki"
                        ? onWikiClick
                        : item.href === "/teams"
                          ? onTeamsClick
                          : item.href === "/codebases"
                            ? onCodebasesClick
                            : onSettingsClick;
                  return (
                    <li key={item.href}>
                      <SubSidebarNavButton
                        item={item}
                        isActive={isActive}
                        isIconOnly={isIconOnly}
                        isMobile={isMobile}
                        onClick={onClick}
                      />
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      pathname={pathname}
                      isIconOnly={isIconOnly}
                      isMobile={isMobile}
                      unreadCount={unreadCount}
                      proposalsCount={proposalsCount}
                      onNavigate={onNavigate}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
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
        "flex-1 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      {settingsNavGroups.map((group) => (
        <div key={group.title} className="px-1 mb-4">
          {!isIconOnly ? (
            <div className="flex items-center gap-2 px-3.5 mb-2">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted/70">
                {group.title}
              </span>
              <Separator className="flex-1" />
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <Separator className="w-6" />
            </div>
          )}
          <ul className={cn("space-y-1", !isIconOnly && "pl-3")}>
            {group.items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon as NavIcon;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    onClick={onNavigate}
                    title={isIconOnly ? item.label : undefined}
                    className={cn(
                      "group relative flex w-full items-center rounded-lg text-sm font-medium tracking-normal transition-[transform,background-color,color] duration-200 ease-smooth active:scale-[0.98]",
                      isIconOnly
                        ? "justify-center px-2 py-2.5"
                        : "gap-3 px-3.5",
                      isMobile ? "py-3.5" : "py-2.5",
                      isActive
                        ? "bg-surface-tertiary text-foreground"
                        : "text-muted hover:bg-surface-tertiary/50 hover:text-foreground",
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
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </motion.nav>
  );
}

export function SidebarNavigation({
  pathname,
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
      ) : navView === "teams" ? (
        <TeamsSidebarNav
          key="teams"
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
          unreadCount={unreadCount}
          proposalsCount={proposalsCount}
          isIconOnly={isIconOnly}
          isMobile={isMobile}
          onNavigate={onNavigate}
          onSettingsClick={() => onNavViewChange("settings")}
          onSkillsClick={() => onNavViewChange("skills")}
          onWikiClick={() => onNavViewChange("wiki")}
          onTeamsClick={() => onNavViewChange("teams")}
          onCodebasesClick={() => onNavViewChange("codebases")}
        />
      )}
    </AnimatePresence>
  );
}
