import type { MouseEventHandler } from "react";
import type { NavItem } from "./types";
import { NavLink } from "./NavLink";
import { SubSidebarShell } from "./SubSidebarShell";

type StackedSidebarNavProps = {
  items: NavItem[];
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  "aria-label": string;
  preserveSearch?: boolean;
};

// Settings-style stacked rows: icon + label, package static fill.
export function StackedSidebarNav({
  items,
  pathname,
  profileId,
  isMobile,
  onNavigate,
  "aria-label": ariaLabel,
  preserveSearch = false,
}: StackedSidebarNavProps) {
  return (
    <SubSidebarShell isMobile={isMobile} aria-label={ariaLabel}>
      {profileId === undefined ? null : (
        <div className="space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              profileId={profileId}
              isIconOnly={false}
              unreadCount={0}
              proposalsCount={0}
              preserveSearch={preserveSearch}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </SubSidebarShell>
  );
}
