import {
  IconMessageCircle,
  IconKey,
  IconBell,
  IconSettings,
  IconFiles,
  IconDatabase,
  IconPlugConnected,
  IconList,
  IconTopologyStar3,
  IconChartBar,
  IconStack2,
  IconPlug,
  IconUserCircle,
  IconAdjustments,
  IconShieldLock,
  IconLayoutDashboard,
  IconTerminal2,
  IconHistory,
} from "@tabler/icons-react";
import type { NavGroup, SettingsNavItem } from "./types";

export const navGroups: NavGroup[] = [
  {
    title: "Workspace",
    icon: IconStack2,
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: IconLayoutDashboard,
      },
      { href: "/chat", label: "Chat", icon: IconMessageCircle },
      { href: "/memories/list", label: "Memory List", icon: IconList },
      {
        href: "/memories/graph",
        label: "Memory Graph",
        icon: IconTopologyStar3,
      },
      {
        href: "/memories/timeline",
        label: "Timeline",
        icon: IconHistory,
      },
      { href: "/files", label: "Files", icon: IconFiles },
      { href: "/index", label: "Index", icon: IconDatabase },
    ],
  },
  {
    title: "API",
    icon: IconPlug,
    items: [{ href: "/usage", label: "Usage", icon: IconChartBar }],
  },
  {
    title: "Account",
    icon: IconUserCircle,
    items: [
      { href: "/notifications", label: "Notifications", icon: IconBell },
      { href: "/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

export const settingsNavItems: SettingsNavItem[] = [
  {
    href: "/settings/preferences",
    label: "Preferences",
    icon: IconAdjustments,
  },
  {
    href: "/settings/data-controls",
    label: "Data Controls",
    icon: IconShieldLock,
  },
  {
    href: "/settings/api-keys",
    label: "API Keys",
    icon: IconKey,
  },
  {
    href: "/settings/connectors",
    label: "Connectors",
    icon: IconPlugConnected,
  },
  {
    href: "/settings/playground",
    label: "Playground",
    icon: IconTerminal2,
  },
];
