import type { MouseEventHandler } from "react";
import { Link } from "@tanstack/react-router";
import { IconSearch } from "@tabler/icons-react";
import {
  IconVmem,
  RailCollapseTile,
  RailDivider,
  RailTile,
  SettingsIcon,
  SidebarRail,
  SidebarUpgradeCard,
  Skeleton,
  railBadgeClass,
} from "@vvedantb/ui";
import { openPricingModal } from "@/lib/pricing-modal";
import { useHasVPlan } from "@/lib/vPlan";
import type { NavHref, NavItem } from "./types";
import {
  homeRailHref,
  inboxRailItem,
  isRailItemActive,
  navHrefToPath,
  navItemBadgeCount,
  railLibraryItems,
  railSectionFromPathname,
  settingsRailItem,
  teamRailItem,
  type SidebarLayout,
} from "./nav-config";
import { SidebarUserMenu } from "./SidebarUserMenu";

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
      : item.href === inboxRailItem.href
        ? section === "inbox"
        : isRailItemActive(item.href, pathname, profileId);
  const badgeCount = navItemBadgeCount(item.href, {
    unreadCount,
    proposalsCount,
  });

  return (
    <RailTile
      asChild
      label={item.label}
      active={active}
      badge={
        badgeCount > 0 ? (
          <span className={railBadgeClass}>
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null
      }
    >
      <Link to={resolvedPath} onClick={onNavigate}>
        <Icon size={22} strokeWidth={1.7} />
      </Link>
    </RailTile>
  );
}

export type VmemSidebarRailProps = {
  layout: SidebarLayout;
  pathname: string;
  profileId: string | undefined;
  isTeamWorkspace: boolean;
  unreadCount: number;
  proposalsCount: number;
  isCollapsed: boolean;
  isPanelHidden: boolean;
  isAuthLoading: boolean;
  onToggleCollapse: () => void;
  onOpenSearch: () => void;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

export function VmemSidebarRail({
  layout,
  pathname,
  profileId,
  isTeamWorkspace,
  unreadCount,
  proposalsCount,
  isCollapsed,
  isPanelHidden,
  isAuthLoading,
  onToggleCollapse,
  onOpenSearch,
  onNavigate,
}: VmemSidebarRailProps) {
  const hasPro = useHasVPlan();
  const homePath = navHrefToPath(homeRailHref satisfies NavHref, profileId);
  const homeActive = railSectionFromPathname(pathname) === "home";
  const settingsPath = navHrefToPath(settingsRailItem.href, profileId);
  const settingsActive = isRailItemActive(
    settingsRailItem.href,
    pathname,
    profileId,
  );

  // Internal rail/panel divider only. When the panel is hidden this would
  // sit on the outer edge against the floating main content.
  const showRailPanelDivider =
    !isPanelHidden && !(layout === "desktop" && isCollapsed);
  // The full card lives in the panel. Use the compact card only when the panel is collapsed.
  const showRailUpgrade = !hasPro && layout === "desktop" && isCollapsed;

  return (
    <SidebarRail
      showDivider={showRailPanelDivider}
      bodyClassName="scrollbar-thin"
      footerClassName="border-t border-separator"
      top={
        <>
          <RailTile asChild label="Home" active={homeActive}>
            <Link to={homePath} onClick={onNavigate}>
              <IconVmem size={22} className="text-current" />
            </Link>
          </RailTile>
          <RailNavItem
            item={inboxRailItem}
            pathname={pathname}
            profileId={profileId}
            unreadCount={unreadCount}
            proposalsCount={proposalsCount}
            onNavigate={onNavigate}
          />
          <RailDivider />
        </>
      }
      footer={
        <>
          {layout === "desktop" ? (
            <RailCollapseTile
              collapsed={isCollapsed}
              onToggle={onToggleCollapse}
            />
          ) : null}
          <RailTile label="Search" onClick={onOpenSearch}>
            <IconSearch className="size-[22px]" />
          </RailTile>
          {showRailUpgrade ? (
            <SidebarUpgradeCard collapsed onUpgrade={openPricingModal} />
          ) : null}
          {isAuthLoading ? (
            <Skeleton className="size-11 rounded-lg" />
          ) : (
            <SidebarUserMenu />
          )}
          <RailTile
            asChild
            label={settingsRailItem.label}
            active={settingsActive}
          >
            <Link to={settingsPath} onClick={onNavigate}>
              <SettingsIcon size={22} />
            </Link>
          </RailTile>
        </>
      }
    >
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
      {isTeamWorkspace ? (
        <>
          <RailDivider />
          <RailNavItem
            item={teamRailItem}
            pathname={pathname}
            profileId={profileId}
            unreadCount={unreadCount}
            proposalsCount={proposalsCount}
            onNavigate={onNavigate}
          />
        </>
      ) : null}
    </SidebarRail>
  );
}
