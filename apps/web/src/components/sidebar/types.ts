import type { ComponentType } from "react";
import type { FileRouteTypes } from "@/routeTree.gen";

type NavIcon = ComponentType<{
  className?: string;
  size?: number;
  stroke?: number;
}>;

// verified route target
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

interface SettingsNavItem {
  href: NavHref;
  label: string;
  icon: NavIcon;
}

export interface SettingsNavGroup {
  title: string;
  items: SettingsNavItem[];
}
