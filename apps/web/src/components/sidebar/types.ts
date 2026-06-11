import type { ComponentType } from "react";
import type { FileRouteTypes } from "@/routeTree.gen";

export type NavIcon = ComponentType<{
  className?: string;
  size?: number;
  stroke?: number;
}>;

/**
 * Verified route target. Typing hrefs against the generated route union
 * means a renamed/moved route breaks nav-config at compile time instead of
 * silently producing dead links.
 */
export type NavHref = FileRouteTypes["to"];

export interface NavItem {
  href: NavHref;
  label: string;
  icon: NavIcon;
}

export interface NavGroup {
  title: string;
  icon: NavIcon;
  items: NavItem[];
}

export interface SettingsNavItem {
  href: NavHref;
  label: string;
  icon: NavIcon;
}

export interface SettingsNavGroup {
  title: string;
  items: SettingsNavItem[];
}
