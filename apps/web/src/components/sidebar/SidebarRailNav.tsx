import type { MouseEventHandler, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button, cn } from "@vmem/ui";
import type { NavHref, NavItem } from "./types";
import {
  homeRailHref,
  isRailItemActive,
  navHrefToPath,
  railAccountItems,
  railLibraryItems,
  railSectionFromPathname,
  teamRailItem,
  type SidebarLayout,
} from "./nav-config";
import { SidebarIconTooltip } from "./SidebarIconTooltip";
import {
  RAIL_BADGE_CLASS,
  RAIL_TILE_CLASS,
  railTileStateClass,
} from "./sidebar-nav-row";
import { VmemDrawInIcon } from "../icons/animations";

export function RailLinkTile({
  label,
  to,
  active,
  badge,
  onNavigate,
  children,
}: {
  label: string;
  to: string;
  active: boolean;
  badge?: ReactNode;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  children: ReactNode;
}) {
  return (
    <SidebarIconTooltip label={label} enabled>
      <Link
        to={to}
        onClick={onNavigate}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={cn(RAIL_TILE_CLASS, "group", railTileStateClass(active))}
      >
        {children}
        {badge}
      </Link>
    </SidebarIconTooltip>
  );
}

export function RailButtonTile({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarIconTooltip label={label} enabled>
      <Button
        type="button"
        variant="ghost"
        onClick={onClick}
        aria-label={label}
        className={cn(
          RAIL_TILE_CLASS,
          "group h-11 w-11 p-0",
          railTileStateClass(false),
        )}
      >
        {children}
      </Button>
    </SidebarIconTooltip>
  );
}

function RailDivider() {
  return <div className="h-px w-8 bg-separator" aria-hidden />;
}

function RailNavItem({
  item,
  pathname,
  profileId,
  unreadCount,
  proposalsCount,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  profileId: string | undefined;
  unreadCount: number;
  proposalsCount: number;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const Icon = item.icon;
  const resolvedPath = navHrefToPath(item.href, profileId);
  const section = railSectionFromPathname(pathname);
  const active =
    item.href === teamRailItem.href
      ? section === "team"
      : isRailItemActive(item.href, pathname, profileId);
  const badgeCount = item.href.endsWith("/inbox")
    ? proposalsCount + unreadCount
    : 0;

  return (
    <RailLinkTile
      label={item.label}
      to={resolvedPath}
      active={active}
      onNavigate={onNavigate}
      badge={
        badgeCount > 0 ? (
          <span className={RAIL_BADGE_CLASS}>
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null
      }
    >
      <Icon size={22} stroke={1.7} />
    </RailLinkTile>
  );
}

export type SidebarRailNavProps = {
  layout: SidebarLayout;
  pathname: string;
  profileId: string | undefined;
  isTeamWorkspace: boolean;
  unreadCount: number;
  proposalsCount: number;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

export function SidebarRailNav({
  pathname,
  profileId,
  isTeamWorkspace,
  unreadCount,
  proposalsCount,
  onNavigate,
}: SidebarRailNavProps) {
  const homePath = navHrefToPath(homeRailHref satisfies NavHref, profileId);
  const homeActive = railSectionFromPathname(pathname) === "home";

  return (
    <>
      <div className="flex w-full flex-col items-center gap-1.5 px-0 pt-3">
        <RailLinkTile
          label="Home"
          to={homePath}
          active={homeActive}
          onNavigate={onNavigate}
        >
          <VmemDrawInIcon size={22} className="text-current" />
        </RailLinkTile>
        <RailDivider />
      </div>
      <div className="flex w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto py-2 scrollbar-thin">
        {railLibraryItems.map((item) => (
          <RailNavItem
            key={item.href}
            item={item}
            pathname={pathname}
            profileId={profileId}
            unreadCount={unreadCount}
            proposalsCount={proposalsCount}
            onNavigate={onNavigate}
          />
        ))}
        <RailDivider />
        {railAccountItems.map((item) => (
          <RailNavItem
            key={item.href}
            item={item}
            pathname={pathname}
            profileId={profileId}
            unreadCount={unreadCount}
            proposalsCount={proposalsCount}
            onNavigate={onNavigate}
          />
        ))}
        {isTeamWorkspace ? (
          <RailNavItem
            item={teamRailItem}
            pathname={pathname}
            profileId={profileId}
            unreadCount={unreadCount}
            proposalsCount={proposalsCount}
            onNavigate={onNavigate}
          />
        ) : null}
      </div>
    </>
  );
}
