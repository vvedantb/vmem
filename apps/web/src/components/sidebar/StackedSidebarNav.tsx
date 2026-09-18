import type { MouseEventHandler } from "react";
import type { NavItem } from "./types";
import { navHrefToPath } from "./nav-config";
import { NavLink } from "./NavLink";
import { SharedLayoutBackground } from "./SharedLayoutBackground";
import { SubSidebarShell } from "./SubSidebarShell";

type StackedSidebarNavProps = {
  items: NavItem[];
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  layoutId: string;
  "aria-label": string;
  preserveSearch?: boolean;
};

// Settings-style stacked rows: icon + label + shared-layout pill.
export function StackedSidebarNav({
  items,
  pathname,
  profileId,
  isMobile,
  onNavigate,
  layoutId,
  "aria-label": ariaLabel,
  preserveSearch = false,
}: StackedSidebarNavProps) {
  return (
    <SubSidebarShell isMobile={isMobile} aria-label={ariaLabel}>
      {profileId === undefined ? null : (
        <SharedLayoutBackground.Root layoutId={layoutId} className="space-y-1">
          {items.map((item) => {
            const resolvedPath = navHrefToPath(item.href, profileId);
            const isActive =
              pathname === resolvedPath ||
              pathname.startsWith(`${resolvedPath}/`);
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
                  preserveSearch={preserveSearch}
                  onNavigate={onNavigate}
                />
              </SharedLayoutBackground.Item>
            );
          })}
        </SharedLayoutBackground.Root>
      )}
    </SubSidebarShell>
  );
}
