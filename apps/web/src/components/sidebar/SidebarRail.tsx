import type { MouseEventHandler } from "react";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpandFilled,
  IconSearch,
} from "@tabler/icons-react";
import { Skeleton, cn } from "@vmem/ui";
import {
  isRailItemActive,
  navHrefToPath,
  settingsRailItem,
  type SidebarLayout,
} from "./nav-config";
import { RailButtonTile, RailLinkTile, SidebarRailNav } from "./SidebarRailNav";
import { SidebarUserMenu } from "./SidebarUserMenu";
import { IconSettings } from "../icons/sidebar";

export type SidebarRailProps = {
  layout: SidebarLayout;
  pathname: string;
  profileId: string | undefined;
  isTeamWorkspace: boolean;
  unreadCount: number;
  proposalsCount: number;
  isCollapsed: boolean;
  isAuthLoading: boolean;
  onToggleCollapse: () => void;
  onOpenSearch: () => void;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

export function SidebarRail({
  layout,
  pathname,
  profileId,
  isTeamWorkspace,
  unreadCount,
  proposalsCount,
  isCollapsed,
  isAuthLoading,
  onToggleCollapse,
  onOpenSearch,
  onNavigate,
}: SidebarRailProps) {
  const settingsPath = navHrefToPath(settingsRailItem.href, profileId);
  const settingsActive = isRailItemActive(
    settingsRailItem.href,
    pathname,
    profileId,
  );
  const collapseLabel = isCollapsed ? "Show sidebar" : "Hide sidebar";

  const showRailPanelDivider = !(layout === "desktop" && isCollapsed);

  return (
    <div
      className={cn(
        "flex h-full w-[var(--vmem-sidebar-rail-width)] shrink-0 flex-col items-center bg-background",
        // Internal rail/panel divider only. When the panel is hidden this would
        // sit on the outer edge against the floating main content.
        showRailPanelDivider && "border-r border-separator",
      )}
    >
      <SidebarRailNav
        layout={layout}
        pathname={pathname}
        profileId={profileId}
        isTeamWorkspace={isTeamWorkspace}
        unreadCount={unreadCount}
        proposalsCount={proposalsCount}
        onNavigate={onNavigate}
      />
      <div className="flex w-full flex-col items-center gap-1.5 border-t border-separator py-3">
        {layout === "desktop" ? (
          <RailButtonTile label={collapseLabel} onClick={onToggleCollapse}>
            {isCollapsed ? (
              <IconLayoutSidebarLeftExpandFilled className="size-[22px]" />
            ) : (
              <IconLayoutSidebarLeftCollapse className="size-[22px]" />
            )}
          </RailButtonTile>
        ) : null}
        <RailButtonTile label="Search" onClick={onOpenSearch}>
          <IconSearch className="size-[22px]" />
        </RailButtonTile>
        {isAuthLoading ? (
          <Skeleton className="size-11 rounded-lg" />
        ) : (
          <SidebarUserMenu />
        )}
        <RailLinkTile
          label={settingsRailItem.label}
          to={settingsPath}
          active={settingsActive}
          onNavigate={onNavigate}
        >
          <IconSettings size={22} stroke={1.7} />
        </RailLinkTile>
      </div>
    </div>
  );
}

export function sidebarRailWidthClass(collapsed: boolean): string {
  return cn(
    collapsed
      ? "md:w-[var(--vmem-sidebar-rail-width)]"
      : "md:w-[var(--vmem-sidebar-width)]",
  );
}
