import {
  IconKey,
  IconPlugConnected,
  IconStack2,
  IconUserCircle,
  IconAdjustments,
  IconPuzzle,
  IconFileImport,
  IconUsers,
  IconLock,
} from "@tabler/icons-react";
import {
  IconMemories,
  IconFiles,
  IconCodebases,
  IconSkills,
  IconWiki,
  IconActivity,
  IconInbox,
  IconSettings,
} from "../sidebar-icons";
import type { NavGroup, NavHref, SettingsNavGroup } from "./types";

// workspace-scoped nav items use the `$profileId` placeholder; resolve them with
export const navGroups: NavGroup[] = [
  {
    title: "Library",
    icon: IconStack2,
    items: [
      { href: "/$profileId/memories", label: "Memories", icon: IconMemories },
      { href: "/$profileId/wiki", label: "Wiki", icon: IconWiki },
      { href: "/$profileId/skills", label: "Skills", icon: IconSkills },
      { href: "/$profileId/files", label: "Files", icon: IconFiles },
      {
        href: "/$profileId/codebases",
        label: "Codebases",
        icon: IconCodebases,
      },
    ],
  },
  {
    title: "Account",
    icon: IconUserCircle,
    items: [
      { href: "/$profileId/activity", label: "Activity", icon: IconActivity },
      { href: "/$profileId/inbox", label: "Inbox", icon: IconInbox },
      { href: "/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

// resolve a nav href into a concrete pathname for the active workspace
export function navHrefToPath(
  href: NavHref,
  profileId: string | undefined,
): string {
  if (!href.includes("$profileId")) return href;
  if (profileId === undefined) return "/home";
  return href.replace("$profileId", profileId);
}

// settings sub-nav, grouped into 3 sections rendered with headers in the settings
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
    ],
  },
  {
    title: "Developer",
    items: [
      { href: "/settings/api", label: "API", icon: IconKey },
      { href: "/settings/secrets", label: "Secrets", icon: IconLock },
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
