import {
  IconKey,
  IconPlugConnected,
  IconStack2,
  IconUserCircle,
  IconAdjustments,
  IconTerminal2,
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

/**
 * Workspace-scoped nav items use the `$profileId` placeholder; resolve them
 * with `navHrefToPath` (or pass `params` to a typed `<Link>`). Teams have no
 * nav item — team workspaces live in the sidebar workspace switcher.
 */
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

/**
 * Resolve a nav href into a concrete pathname for the active workspace.
 * Without a known workspace, workspace-scoped hrefs fall back to `/home`
 * (the workspace resolver route); user-level hrefs pass through untouched.
 */
export function navHrefToPath(
  href: NavHref,
  profileId: string | undefined,
): string {
  if (!href.includes("$profileId")) return href;
  if (profileId === undefined) return "/home";
  return href.replace("$profileId", profileId);
}

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
    ],
  },
  {
    title: "Developer",
    items: [
      { href: "/settings/api", label: "API", icon: IconKey },
      { href: "/settings/secrets", label: "Secrets", icon: IconLock },
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
