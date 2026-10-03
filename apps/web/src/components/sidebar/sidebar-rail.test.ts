import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  homeRailHref,
  inboxRailItem,
  isRailItemActive,
  navGroups,
  navHrefToPath,
  railLibraryItems,
  railSectionFromPathname,
  settingsRailItem,
  teamRailItem,
  navViewFromPathname,
  panelTitleBySection,
  railSectionHidesPanel,
} from "./nav-config";

const here = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(path.join(here, rel), "utf8");
}

describe("railSectionFromPathname", () => {
  it("maps primary vmem destinations", () => {
    expect(railSectionFromPathname("/home")).toBe("home");
    expect(railSectionFromPathname("/p1/home")).toBe("home");
    expect(railSectionFromPathname("/p1/memories")).toBe("memories");
    expect(railSectionFromPathname("/p1/memories/graph")).toBe("memories");
    expect(railSectionFromPathname("/p1/wiki/abc")).toBe("wiki");
    expect(railSectionFromPathname("/p1/skills/hub")).toBe("skills");
    expect(railSectionFromPathname("/p1/files")).toBe("files");
    expect(railSectionFromPathname("/p1/usage")).toBe("usage");
    expect(railSectionFromPathname("/p1/team/settings")).toBe("team");
    expect(railSectionFromPathname("/settings/preferences")).toBe("settings");
  });

  it("gives inbox and sources their own rail sections", () => {
    expect(railSectionFromPathname("/p1/inbox")).toBe("inbox");
    expect(railSectionFromPathname("/p1/inbox/proposals")).toBe("inbox");
    expect(railSectionFromPathname("/p1/inbox/notifications")).toBe("inbox");
    expect(railSectionFromPathname("/p1/proposals")).toBe("inbox");
    expect(railSectionFromPathname("/p1/notifications")).toBe("inbox");
    expect(railSectionFromPathname("/p1/sources")).toBe("sources");
    expect(railSectionFromPathname("/p1/sources/connectors")).toBe("sources");
    expect(railSectionFromPathname("/p1/sources/import")).toBe("sources");
  });

  it("folds nested sidebars into panel modes", () => {
    expect(navViewFromPathname("/settings/api")).toBe("settings");
    expect(navViewFromPathname("/p1/skills/hub")).toBe("skills");
    expect(navViewFromPathname("/p1/wiki/abc")).toBe("wiki");
    expect(navViewFromPathname("/p1/memories")).toBe("memories");
    expect(navViewFromPathname("/p1/memories/graph")).toBe("memories");
    expect(navViewFromPathname("/p1/home")).toBe("main");
    expect(navViewFromPathname("/p1/usage")).toBe("main");
  });

  it("opens no stacked sidebar panel for inbox or sources", () => {
    expect(navViewFromPathname("/p1/inbox")).toBe("main");
    expect(navViewFromPathname("/p1/inbox/proposals")).toBe("main");
    expect(navViewFromPathname("/p1/inbox/notifications")).toBe("main");
    expect(navViewFromPathname("/p1/sources")).toBe("main");
    expect(navViewFromPathname("/p1/sources/import")).toBe("main");
    expect(navViewFromPathname("/p1/files")).toBe("main");
  });
});

describe("rail destinations cover the previous sidebar nav", () => {
  it("keeps library, team, settings, and home on the rail", () => {
    const hrefs = [
      homeRailHref,
      ...railLibraryItems.map((item) => item.href),
      teamRailItem.href,
      settingsRailItem.href,
    ];
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/$profileId/home",
        "/$profileId/memories",
        "/$profileId/wiki",
        "/$profileId/skills",
        "/$profileId/files",
        "/$profileId/usage",
        "/$profileId/sources",
        "/$profileId/team/members",
        "/settings",
      ]),
    );
    expect(railLibraryItems.map((item) => item.label)).toEqual([
      "Memories",
      "Wiki",
      "Skills",
      "Files",
      "Usage",
      "Sources",
    ]);
    expect(hrefs).not.toContain("/$profileId/activity");
    expect(hrefs.some((href) => href.includes("activity"))).toBe(false);
  });

  it("puts inbox and sources back on the rail", () => {
    expect(inboxRailItem.href).toBe("/$profileId/inbox");
    expect(railLibraryItems.at(-1)?.href).toBe("/$profileId/sources");

    const railNav = read("SidebarRailNav.tsx");
    expect(railNav).toContain("item={inboxRailItem}");
  });

  it("still lists inbox and sources in the command palette groups", () => {
    const paletteHrefs = navGroups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(paletteHrefs).toContain("/$profileId/inbox");
    expect(paletteHrefs).toContain("/$profileId/sources");
  });

  it("does not advertise codebases", () => {
    const nav = read("nav-config.ts");
    expect(nav.toLowerCase()).not.toContain("codebase");
  });
});

describe("isRailItemActive", () => {
  it("matches nested routes under a destination", () => {
    expect(isRailItemActive("/$profileId/wiki", "/abc/wiki/doc", "abc")).toBe(
      true,
    );
    expect(isRailItemActive("/settings", "/settings/api", undefined)).toBe(
      true,
    );
    expect(isRailItemActive("/$profileId/memories", "/abc/files", "abc")).toBe(
      false,
    );
  });

  it("falls back to /home when no workspace is selected", () => {
    expect(navHrefToPath("/$profileId/memories", undefined)).toBe("/home");
  });
});

describe("shell uses a rail + panel + drawer", () => {
  it("composes SidebarRail in both desktop and drawer layouts", () => {
    const sidebar = read("../shell/Sidebar.tsx");
    expect(sidebar).toContain("SidebarRail");
    expect(sidebar).toContain("data-sidebar-layout={layout}");
    expect(sidebar).toContain('"desktop"');
    expect(sidebar).toContain('"drawer"');
    expect(sidebar).not.toContain("DialogPortal");
  });

  it("keeps settings / skills / wiki / memories as panel modes", () => {
    const navigation = read("SidebarNavigation.tsx");
    expect(navigation).toContain("SettingsSidebar");
    expect(navigation).toContain("SkillsSidebarNav");
    expect(navigation).toContain("WikiSidebarNav");
    expect(navigation).toContain("MemoriesSidebarNav");
    expect(navigation).not.toContain("HomeSidebarNav");
    expect(navigation).not.toContain("InboxSidebarNav");
    expect(navigation).not.toContain("SourcesSidebarNav");
    expect(navigation).not.toContain('navView === "inbox"');
    expect(navigation).not.toContain('navView === "sources"');
    expect(navigation).not.toContain("ActivitySidebarNav");
    expect(navigation).toContain('section === "team"');
  });

  it("does not draw a right border on the panel against floating content", () => {
    const sidebar = read("../shell/Sidebar.tsx");
    expect(sidebar).not.toMatch(/overflow-hidden border-r border-separator/);
    expect(read("../shell/MainShell.tsx")).toContain("md:rounded-lg");
    expect(read("../shell/MainShell.tsx")).toContain("md:p-2");
  });

  it("keeps the rail/panel divider only while the panel is open", () => {
    const rail = read("SidebarRail.tsx");
    expect(rail).toContain("showRailPanelDivider");
    expect(rail).toContain("border-r border-separator");
    expect(rail).toContain('layout === "desktop" && isCollapsed');
    expect(rail).toContain("!isPanelHidden");
  });

  it("drops the sidebar panel column on inbox and sources", () => {
    expect(railSectionHidesPanel("inbox")).toBe(true);
    expect(railSectionHidesPanel("sources")).toBe(true);
    for (const section of [
      "home",
      "memories",
      "wiki",
      "skills",
      "files",
      "usage",
      "team",
      "settings",
    ] as const) {
      expect(railSectionHidesPanel(section)).toBe(false);
    }
    expect(Object.keys(panelTitleBySection)).not.toContain("inbox");
    expect(Object.keys(panelTitleBySection)).not.toContain("sources");
    expect(panelTitleBySection.files).toBe("Files");
    expect(panelTitleBySection.usage).toBe("Usage");

    const sidebar = read("../shell/Sidebar.tsx");
    expect(sidebar).toContain("railSectionHidesPanel(section)");
    expect(sidebar).toContain(
      "sidebarRailWidthClass(isCollapsed || hidePanel)",
    );
    expect(sidebar).toContain("panelSection === null ? null");
    expect(sidebar).toContain("isPanelHidden={hidePanel}");

    const shell = read("../shell/MainShell.tsx");
    expect(shell).toContain(
      "railSectionHidesPanel(railSectionFromPathname(pathname))",
    );
    expect(shell).toMatch(
      /isPanelHidden\s*\?\s*"md:ml-\[var\(--vmem-sidebar-rail-width\)\]"/,
    );
    // Route-driven hiding never writes the stored collapse preference.
    expect(shell).toContain('"sidebar-collapsed"');
    expect(shell).not.toMatch(/setIsSidebarCollapsed\(\s*true/);
  });

  it("places inbox under home, then the divider, and no activity rail tile", () => {
    const railNav = read("SidebarRailNav.tsx");
    const homeIdx = railNav.indexOf('label="Home"');
    const inboxIdx = railNav.indexOf("item={inboxRailItem}", homeIdx);
    const dividerIdx = railNav.indexOf("<RailDivider />", inboxIdx);
    const libraryIdx = railNav.indexOf("railLibraryItems.map", dividerIdx);
    expect(homeIdx).toBeGreaterThan(-1);
    expect(inboxIdx).toBeGreaterThan(homeIdx);
    expect(dividerIdx).toBeGreaterThan(inboxIdx);
    expect(libraryIdx).toBeGreaterThan(dividerIdx);
    expect(railNav).toContain("RAIL_BADGE_CLASS");
    expect(railNav).toContain("proposalsCount + unreadCount");
    expect(read("../shell/Sidebar.tsx")).toContain("unreadCount={unreadCount}");
    expect(railNav).not.toContain("railAccountItems");
    expect(railNav).not.toContain("IconActivity");
    expect(railNav).not.toMatch(/label:\s*"Activity"/);
  });
});

describe("nested sidebar chrome", () => {
  it("hosts memory views as stacked sidebar rows", () => {
    const memories = read("MemoriesSidebarNav.tsx");
    expect(memories).toContain("StackedSidebarNav");
    expect(memories).toContain("Graph");
    expect(memories).toContain("List");
    expect(memories).toContain("Tags");
    expect(memories).toContain("/$profileId/memories/tags");
    expect(memories).toContain("Timeline");
    expect(memories).toContain('aria-label="Memory views"');
    expect(memories).not.toContain("RouteTabs");
    expect(memories).not.toContain("fullWidth");
    expect(read("../../routes/_main/$profileId/memories/tags.tsx")).toContain(
      "TagsListView",
    );
    expect(
      read("../../routes/_main/$profileId/memories/tags.tsx"),
    ).not.toContain("redirect");
    expect(
      read("../../routes/_main/$profileId/memories/list/route.tsx"),
    ).toContain("memoriesTagsViewRedirectHref");
    expect(
      read("../../routes/_main/$profileId/memories/list/route.tsx"),
    ).not.toContain("isTagsView");

    expect(() => read("HomeSidebarNav.tsx")).toThrow();
    expect(() => read("InboxSidebarNav.tsx")).toThrow();
    expect(() => read("SourcesSidebarNav.tsx")).toThrow();

    const stacked = read("StackedSidebarNav.tsx");
    expect(stacked).toContain("NavLink");
    expect(stacked).toContain("SharedLayoutBackground");
    expect(stacked).not.toContain("RouteTabs");

    expect(read("../shell/RouteTabs.tsx")).not.toContain("fullWidth");
    expect(
      read("../../routes/_main/$profileId/memories/route.tsx"),
    ).not.toContain("leftSection");
    expect(read("../../routes/_main/$profileId/usage.tsx")).not.toContain(
      "leftSection",
    );
    expect(read("../../routes/_main/$profileId/inbox/route.tsx")).not.toContain(
      "leftSection",
    );
    expect(read("../../routes/_main/$profileId/inbox/route.tsx")).toContain(
      "InboxTabs",
    );
  });

  it("parks a plus-only add control on the skills and wiki title row", () => {
    expect(read("SkillsSidebarNav.tsx")).toContain("SidebarHeaderTrailing");
    expect(read("WikiSidebarNav.tsx")).toContain("SidebarHeaderTrailing");
    expect(read("SidebarHeader.tsx")).toContain("text-left");
    expect(read("SidebarHeader.tsx")).toContain("pl-3 pr-1");
    expect(read("SidebarHeader.tsx")).not.toContain("text-center");

    const addMenu = read("../shell/FeatureAddMenu.tsx");
    expect(addMenu).toContain('aria-label="Add"');
    expect(addMenu).toContain("IconPlus");
    expect(addMenu).not.toContain("IconChevronDown");
    expect(addMenu).not.toMatch(/>\s*Add\s*</);
  });
});

describe("usage lives on the rail at /usage", () => {
  const routes = "../../routes/_main/$profileId";

  it("serves usage from /usage inside the shared page container", () => {
    const usage = read(`${routes}/usage.tsx`);
    expect(usage).toContain('createFileRoute("/_main/$profileId/usage")');
    expect(usage).toContain("PageContainer");
    expect(usage).toContain("AiLogsPanel");
    expect(usage).toContain("AiLogsRightSection");
  });

  it("redirects the old /activity URLs and drops the events page", () => {
    for (const rel of ["activity/index.tsx", "activity/usage.tsx"]) {
      const route = read(`${routes}/${rel}`);
      expect(route).toContain("redirect");
      expect(route).toContain('to: "/$profileId/usage"');
    }
    expect(() => read(`${routes}/activity/route.tsx`)).toThrow();
    expect(() => read(`${routes}/activity/events.tsx`)).toThrow();
    expect(() => read("../activity/EventsPanel.tsx")).toThrow();
    expect(read("../../routeTree.gen.ts")).not.toContain("activity/events");
  });
});
