import {
  IconKey,
  IconPlugConnected,
  IconStack2,
  IconPlug,
  IconUserCircle,
  IconAdjustments,
  IconTerminal2,
  IconPuzzle,
  IconFileImport,
  IconCpu,
  IconUsers,
  IconVariable,
} from "@tabler/icons-react";
import {
  IconChat,
  IconVoice,
  IconMemories,
  IconTeams,
  IconFiles,
  IconCodebases,
  IconSkills,
  IconWiki,
  IconActivity,
  IconInbox,
  IconSettings,
} from "../sidebar-icons";
import type { NavGroup, SettingsNavGroup } from "./types";

export const navGroups: NavGroup[] = [
  {
    title: "Workspace",
    icon: IconStack2,
    items: [
      { href: "/chat", label: "Chat", icon: IconChat },
      { href: "/voice", label: "Voice", icon: IconVoice },
      { href: "/memories", label: "Memories", icon: IconMemories },
      { href: "/teams", label: "Teams", icon: IconTeams },
    ],
  },
  {
    title: "Data",
    icon: IconPlug,
    items: [
      { href: "/files", label: "Files", icon: IconFiles },
      { href: "/codebases", label: "Codebases", icon: IconCodebases },
      { href: "/skills", label: "Skills", icon: IconSkills },
      { href: "/wiki", label: "Wiki", icon: IconWiki },
    ],
  },
  {
    title: "Account",
    icon: IconUserCircle,
    items: [
      { href: "/activity", label: "Activity", icon: IconActivity },
      { href: "/inbox", label: "Inbox", icon: IconInbox },
      { href: "/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

/**
 * Settings sub-nav, grouped into 3 sections rendered with headers in the
 * settings slide-out (mirroring the main nav group pattern). Routes are
 * unchanged — this is purely a visual grouping for discoverability.
 */
export const settingsNavGroups: SettingsNavGroup[] = [
  {
    title: "General",
    items: [
      {
        href: "/settings/preferences",
        label: "Preferences",
        icon: IconAdjustments,
      },
      { href: "/settings/profiles", label: "Profiles", icon: IconUsers },
      { href: "/settings/models", label: "Models", icon: IconCpu },
    ],
  },
  {
    title: "Developer",
    items: [
      { href: "/settings/api", label: "API", icon: IconKey },
      { href: "/settings/env-vars", label: "Env Vars", icon: IconVariable },
      {
        href: "/settings/playground",
        label: "Playground",
        icon: IconTerminal2,
      },
    ],
  },
  {
    title: "Integrations",
    items: [
      {
        href: "/settings/connectors",
        label: "Connectors",
        icon: IconPlugConnected,
      },
      { href: "/settings/extension", label: "Extension", icon: IconPuzzle },
      {
        href: "/settings/data-controls",
        label: "Data Controls",
        icon: IconFileImport,
      },
    ],
  },
];
