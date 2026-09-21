import type { MouseEventHandler } from "react";
import {
  IconHash,
  IconList,
  IconTimeline,
  IconTopologyStar3,
} from "@tabler/icons-react";
import type { NavItem } from "./types";
import { StackedSidebarNav } from "./StackedSidebarNav";

const memoriesNavItems: NavItem[] = [
  {
    href: "/$profileId/memories/graph",
    label: "Graph",
    icon: IconTopologyStar3,
  },
  { href: "/$profileId/memories/list", label: "List", icon: IconList },
  { href: "/$profileId/memories/tags", label: "Tags", icon: IconHash },
  {
    href: "/$profileId/memories/timeline",
    label: "Timeline",
    icon: IconTimeline,
  },
];

type MemoriesSidebarNavProps = {
  pathname: string;
  profileId: string | undefined;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

export function MemoriesSidebarNav({
  pathname,
  profileId,
  isMobile,
  onNavigate,
}: MemoriesSidebarNavProps) {
  return (
    <StackedSidebarNav
      items={memoriesNavItems}
      pathname={pathname}
      profileId={profileId}
      isMobile={isMobile}
      onNavigate={onNavigate}
      layoutId="memories-nav"
      aria-label="Memory views"
      preserveSearch
    />
  );
}
