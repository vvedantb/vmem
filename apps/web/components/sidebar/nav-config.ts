import {
  IconMessageCircle,
  IconKey,
  IconBell,
  IconSettings,
  IconFiles,
  IconDatabase,
  IconPlugConnected,
  IconList,
  IconShare3,
  IconFileText,
  IconStack2,
  IconPlug,
  IconUserCircle,
  IconAdjustments,
  IconShieldLock,
} from "@tabler/icons-react";
import type { NavGroup, SettingsNavItem } from "./types";

export const navGroups: NavGroup[] = [
  {
    title: "Workspace",
    icon: IconStack2,
    items: [
      { href: "/chat", label: "Chat", icon: IconMessageCircle },
      { href: "/memories/list", label: "Memory List", icon: IconList },
      { href: "/memories/graph", label: "Memory Graph", icon: IconShare3 },
      { href: "/files", label: "Files", icon: IconFiles },
      { href: "/index", label: "Index", icon: IconDatabase },
    ],
  },
  {
    title: "API",
    icon: IconPlug,
    items: [
      { href: "/api/keys", label: "API Keys", icon: IconKey },
      { href: "/api/logs", label: "Usage", icon: IconFileText },
      { href: "/connectors", label: "Connectors", icon: IconPlugConnected },
    ],
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
];
