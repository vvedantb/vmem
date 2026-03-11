import type { ComponentType } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; size?: number; stroke?: number }>;
  children?: NavItem[];
}

export interface NavGroup {
  title: string;
  icon: ComponentType<{ className?: string; size?: number; stroke?: number }>;
  items: NavItem[];
}

export type NavIcon = ComponentType<{
  className?: string;
  size?: number;
  stroke?: number;
}>;
