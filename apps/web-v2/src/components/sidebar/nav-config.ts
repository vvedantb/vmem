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
      { href: "/usage", label: "Usage", icon: IconChartBar },
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
