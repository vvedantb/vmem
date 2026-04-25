import {
  IconMessageCircle,
  IconMicrophone,
  IconKey,
  IconBell,
  IconSettings,
  IconFiles,
  IconDatabase,
  IconPlugConnected,
  IconBrain,
  IconChartBar,
  IconStack2,
  IconPlug,
  IconUserCircle,
  IconAdjustments,
  IconShieldLock,
  IconTerminal2,
  IconPuzzle,
  IconFileImport,
  IconBolt,
  IconNotebook,
  IconActivity,
  IconCpu,
  IconUsers,
  IconBuilding,
  IconVariable,
} from "@tabler/icons-react";
import type { NavGroup, SettingsNavItem } from "./types";

export const navGroups: NavGroup[] = [
  {
    title: "Workspace",
    icon: IconStack2,
    items: [
      { href: "/chat", label: "Chat", icon: IconMessageCircle },
      { href: "/voice", label: "Voice", icon: IconMicrophone },
      { href: "/memories", label: "Memories", icon: IconBrain },
      { href: "/teams", label: "Teams", icon: IconBuilding },
    ],
  },
  {
    title: "Data",
    icon: IconPlug,
    items: [
      { href: "/files", label: "Files", icon: IconFiles },
      { href: "/codebases", label: "Codebases", icon: IconDatabase },
      { href: "/skills", label: "Skills", icon: IconBolt },
      { href: "/wiki", label: "Wiki", icon: IconNotebook },
    ],
  },
  {
    title: "Account",
    icon: IconUserCircle,
    items: [
      { href: "/activity", label: "Activity", icon: IconActivity },
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
    href: "/settings/profiles",
    label: "Profiles",
    icon: IconUsers,
  },
  {
    href: "/settings/models",
    label: "Models",
    icon: IconCpu,
  },
  {
    href: "/settings/extension",
    label: "Extension",
    icon: IconPuzzle,
  },
  {
    href: "/settings/import",
    label: "Import",
    icon: IconFileImport,
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
    href: "/settings/env-vars",
    label: "Env Vars",
    icon: IconVariable,
  },
  {
    href: "/settings/usage",
    label: "Usage",
    icon: IconChartBar,
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
