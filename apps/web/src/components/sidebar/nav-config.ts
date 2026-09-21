import {
  IconKey,
  IconPlugConnected,
  IconStack2,
  IconUserCircle,
  IconAdjustments,
  IconPuzzle,
  IconFileImport,
  IconUsers,
} from "@tabler/icons-react";
import {
  IconMemories,
  IconFiles,
  IconSkills,
  IconWiki,
  IconInbox,
  IconSettings,
  IconTeams,
} from "../icons/sidebar";
import type { NavGroup, NavHref, NavItem, SettingsNavGroup } from "./types";

export type RailSection =
  | "home"
  | "memories"
  | "wiki"
  | "skills"
  | "files"
  | "sources"
  | "inbox"
  | "team"
  | "settings";

export type SidebarLayout = "desktop" | "drawer";

export const railLibraryItems: NavItem[] = [
  { href: "/$profileId/memories", label: "Memories", icon: IconMemories },
  { href: "/$profileId/wiki", label: "Wiki", icon: IconWiki },
  { href: "/$profileId/skills", label: "Skills", icon: IconSkills },
  { href: "/$profileId/files", label: "Files", icon: IconFiles },
  { href: "/$profileId/sources", label: "Sources", icon: IconPlugConnected },
];

export const sourcesNavItems: NavItem[] = [
  {
    href: "/$profileId/sources/connectors",
    label: "Connectors",
    icon: IconPlugConnected,
  },
  {
    href: "/$profileId/sources/import",
    label: "Import",
    icon: IconFileImport,
  },
];

export const inboxRailItem: NavItem = {
  href: "/$profileId/inbox",
  label: "Inbox",
  icon: IconInbox,
};

export const homeRailHref = "/$profileId/home" satisfies NavHref;

export const teamRailItem: NavItem = {
  href: "/$profileId/team/members",
  label: "Team",
  icon: IconTeams,
};

export const settingsRailItem: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: IconSettings,
};

// workspace scoped nav items use the `$profileId` placeholder resolve them with
export const navGroups: NavGroup[] = [
  {
    title: "Library",
    icon: IconStack2,
    items: railLibraryItems,
  },
  {
    title: "Account",
    icon: IconUserCircle,
    items: [inboxRailItem, settingsRailItem],
  },
];

export const panelTitleBySection: Record<RailSection, string> = {
  home: "Home",
  memories: "Memories",
  wiki: "Wiki",
  skills: "Skills",
  files: "Files",
  sources: "Sources",
  inbox: "Inbox",
  team: "Team",
  settings: "Settings",
};

export function railSectionFromPathname(pathname: string): RailSection {
  if (pathname.startsWith("/settings")) return "settings";
  const sub = pathname.replace(/^\/[^/]+/, "");
  if (sub.startsWith("/wiki")) return "wiki";
  if (sub.startsWith("/skills")) return "skills";
  if (sub.startsWith("/files")) return "files";
  if (sub.startsWith("/sources")) return "sources";
  if (
    sub.startsWith("/inbox") ||
    sub.startsWith("/notifications") ||
    sub.startsWith("/proposals")
  ) {
    return "inbox";
  }
  // Usage / Events stay at `/activity/*` so existing deep links work; they
  // belong to the Home rail section rather than a separate Activity item.
  if (sub.startsWith("/activity")) return "home";
  if (sub.startsWith("/team")) return "team";
  if (sub.startsWith("/memories")) return "memories";
  return "home";
}

type SidebarNavView =
  | "main"
  | "settings"
  | "skills"
  | "wiki"
  | "memories"
  | "inbox"
  | "home"
  | "sources";

export function navViewFromPathname(pathname: string): SidebarNavView {
  const section = railSectionFromPathname(pathname);
  if (
    section === "settings" ||
    section === "skills" ||
    section === "wiki" ||
    section === "memories" ||
    section === "inbox" ||
    section === "home" ||
    section === "sources"
  ) {
    return section;
  }
  return "main";
}

export function isRailItemActive(
  href: NavHref,
  pathname: string,
  profileId: string | undefined,
): boolean {
  const resolvedPath = navHrefToPath(href, profileId);
  return pathname === resolvedPath || pathname.startsWith(`${resolvedPath}/`);
}

// resolve a nav href into a concrete pathname for the active workspace
export function navHrefToPath(
  href: NavHref,
  profileId: string | undefined,
): string {
  if (!href.includes("$profileId")) return href;
  if (profileId === undefined) return "/home";
  return href.replace("$profileId", profileId);
}

// settings sub nav, grouped into 3 sections rendered with headers in the settings
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
    items: [{ href: "/settings/api", label: "API", icon: IconKey }],
  },
  {
    title: "Integrations",
    items: [
      { href: "/settings/extension", label: "Extension", icon: IconPuzzle },
      {
        href: "/settings/data-controls",
        label: "Data Controls",
        icon: IconFileImport,
      },
    ],
  },
];
