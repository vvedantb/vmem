import type { MouseEventHandler } from "react";
import { StackedSidebarNav } from "./StackedSidebarNav";
import { sourcesNavItems } from "./nav-config";

type SourcesSidebarNavProps = {
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

export function SourcesSidebarNav({
  pathname,
  profileId,
  isMobile,
  onNavigate,
}: SourcesSidebarNavProps) {
  return (
    <StackedSidebarNav
      items={sourcesNavItems}
      pathname={pathname}
      profileId={profileId}
      isMobile={isMobile}
      onNavigate={onNavigate}
      layoutId="sources-nav"
      aria-label="Source views"
    />
  );
}
