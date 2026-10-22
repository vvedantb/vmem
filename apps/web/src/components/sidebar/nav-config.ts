import {
  IconKey,
  IconPlugConnected,
  IconStack2,
  IconUserCircle,
  IconAdjustments,
  IconPuzzle,
  IconFileImport,
  IconUsers,
  IconReceipt2,
  IconFlask,
  IconTimelineEvent,
  IconMoon,
} from "@tabler/icons-react";
import {
  BoardIcon,
  BoltIcon,
  BuildingIcon,
  FilesIcon,
  InboxIcon,
  MemoryIcon,
  SettingsIcon,
} from "@vvedantb/ui";
import type { NavGroup, NavHref, NavItem, SettingsNavGroup } from "./types";

export type RailSection =
  | "home"
  | "memories"
  | "skills"
  | "files"
  | "artifacts"
  | "usage"
  | "traces"
  | "dreaming"
  | "sources"
  | "inbox"
  | "team"
  | "settings";

export type SidebarLayout = "desktop" | "drawer";

const dreamingRailHref = "/$profileId/dreaming" satisfies NavHref;

export const railLibraryItems: NavItem[] = [
  { href: "/$profileId/memories", label: "Memories", icon: MemoryIcon },
  { href: "/$profileId/skills", label: "Skills", icon: BoltIcon },
  { href: "/$profileId/files", label: "Files", icon: FilesIcon },
  { href: "/$profileId/artifacts", label: "Artifacts", icon: BoardIcon },
  { href: "/$profileId/usage", label: "Usage", icon: IconReceipt2 },
  { href: "/$profileId/traces", label: "Traces", icon: IconTimelineEvent },
  { href: dreamingRailHref, label: "Dreaming", icon: IconMoon },
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

// Inbox (notifications only) and Sources are rail tiles with no sidebar panel
// content. Sources has Connectors / Import page tabs.
export const inboxRailItem: NavItem = {
  href: "/$profileId/inbox",
  label: "Inbox",
  icon: InboxIcon,
};

export const homeRailHref = "/$profileId/home" satisfies NavHref;

export const teamRailItem: NavItem = {
  href: "/$profileId/team/members",
  label: "Team",
  icon: BuildingIcon,
};

export const settingsRailItem: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: SettingsIcon,
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

// Home, Artifacts, Usage, Traces, Dreaming, Inbox and Sources have no sidebar
// panel: the main page sits beside the rail and any nested views are page tabs.
type PanelHiddenSection =
  | "home"
  | "artifacts"
  | "usage"
  | "traces"
  | "dreaming"
  | "inbox"
  | "sources";
type PanelSection = Exclude<RailSection, PanelHiddenSection>;

export function railSectionHidesPanel(
  section: RailSection,
): section is PanelHiddenSection {
  return (
    section === "home" ||
    section === "artifacts" ||
    section === "usage" ||
    section === "traces" ||
    section === "dreaming" ||
    section === "inbox" ||
    section === "sources"
  );
}

export const panelTitleBySection: Record<PanelSection, string> = {
  memories: "Memories",
  skills: "Skills",
  files: "Files",
  team: "Team",
  settings: "Settings",
};

export function railSectionFromPathname(pathname: string): RailSection {
  if (pathname.startsWith("/settings")) return "settings";
  const sub = pathname.replace(/^\/[^/]+/, "");
  if (sub.startsWith("/skills")) return "skills";
  if (sub.startsWith("/files")) return "files";
  if (sub.startsWith("/artifacts")) return "artifacts";
  if (sub.startsWith("/usage")) return "usage";
  if (sub.startsWith("/traces")) return "traces";
  if (sub.startsWith("/dreaming") || sub.startsWith("/proposals")) {
    return "dreaming";
  }
  if (sub.startsWith("/sources")) return "sources";
  if (sub.startsWith("/inbox") || sub.startsWith("/notifications")) {
    return "inbox";
  }
  if (sub.startsWith("/team")) return "team";
  if (sub.startsWith("/memories")) return "memories";
  return "home";
}

type SidebarNavView = "main" | "settings" | "skills" | "memories";

export function navViewFromPathname(pathname: string): SidebarNavView {
  const section = railSectionFromPathname(pathname);
  if (
    section === "settings" ||
    section === "skills" ||
    section === "memories"
  ) {
    return section;
  }
  return "main";
}

// nav badge: unread notifications on Inbox, pending proposals on Dreaming
export function navItemBadgeCount(
  href: NavHref,
  counts: { unreadCount: number; proposalsCount: number },
): number {
  if (href === inboxRailItem.href) return counts.unreadCount;
  if (href === dreamingRailHref) return counts.proposalsCount;
  return 0;
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

// settings sub nav. Groups are command-palette headings only; the sidebar is a flat list.
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
  {
    title: "Experimental",
    items: [
      {
        href: "/settings/experimental",
        label: "Experimental",
        icon: IconFlask,
      },
    ],
  },
];
