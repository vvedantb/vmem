import type { ComponentType } from "react";

export type NavIcon = ComponentType<{
  className?: string;
  size?: number;
  stroke?: number;
}>;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export interface NavGroup {
  title: string;
  icon: NavIcon;
  items: NavItem[];
}

export interface SettingsNavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export interface SettingsNavGroup {
  title: string;
  items: SettingsNavItem[];
}
