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
  navItemBadgeCount,
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
    expect(railSectionFromPathname("/p1/skills/hub")).toBe("skills");
    expect(railSectionFromPathname("/p1/files")).toBe("files");
    expect(railSectionFromPathname("/p1/artifacts")).toBe("artifacts");
    expect(railSectionFromPathname("/p1/artifacts/a1")).toBe("artifacts");
    expect(railSectionFromPathname("/p1/usage")).toBe("usage");
    expect(railSectionFromPathname("/p1/traces")).toBe("traces");
    expect(railSectionFromPathname("/p1/dreaming")).toBe("dreaming");
    expect(railSectionFromPathname("/p1/proposals")).toBe("dreaming");
    expect(railSectionFromPathname("/p1/team/settings")).toBe("team");
    expect(railSectionFromPathname("/settings/preferences")).toBe("settings");
  });

  it("gives inbox and sources their own rail sections", () => {
    expect(railSectionFromPathname("/p1/inbox")).toBe("inbox");
    expect(railSectionFromPathname("/p1/inbox/proposals")).toBe("inbox");
    expect(railSectionFromPathname("/p1/inbox/notifications")).toBe("inbox");
    expect(railSectionFromPathname("/p1/notifications")).toBe("inbox");
    expect(railSectionFromPathname("/p1/sources")).toBe("sources");
    expect(railSectionFromPathname("/p1/sources/connectors")).toBe("sources");
    expect(railSectionFromPathname("/p1/sources/import")).toBe("sources");
  });

  it("folds nested sidebars into panel modes", () => {
    expect(navViewFromPathname("/settings/api")).toBe("settings");
    expect(navViewFromPathname("/p1/skills/hub")).toBe("skills");
    expect(navViewFromPathname("/p1/memories")).toBe("memories");
    expect(navViewFromPathname("/p1/memories/graph")).toBe("memories");
    expect(navViewFromPathname("/p1/home")).toBe("main");
    expect(navViewFromPathname("/p1/usage")).toBe("main");
    expect(navViewFromPathname("/p1/traces")).toBe("main");
    expect(navViewFromPathname("/p1/artifacts")).toBe("main");
    expect(navViewFromPathname("/p1/dreaming")).toBe("main");
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
        "/$profileId/skills",
        "/$profileId/files",
        "/$profileId/artifacts",
        "/$profileId/usage",
        "/$profileId/traces",
        "/$profileId/dreaming",
        "/$profileId/sources",
        "/$profileId/team/members",
        "/settings",
      ]),
    );
    expect(railLibraryItems.map((item) => item.label)).toEqual([
      "Memories",
      "Skills",
      "Files",
      "Artifacts",
      "Usage",
      "Traces",
      "Dreaming",
      "Sources",
    ]);
    expect(hrefs).not.toContain("/$profileId/activity");
    expect(hrefs.some((href) => href.includes("activity"))).toBe(false);
  });

  it("puts inbox and sources back on the rail", () => {
    expect(inboxRailItem.href).toBe("/$profileId/inbox");
    expect(railLibraryItems.at(-1)?.href).toBe("/$profileId/sources");

    const railNav = read("SidebarRail.tsx");
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
    expect(
      isRailItemActive("/$profileId/skills", "/abc/skills/doc", "abc"),
    ).toBe(true);
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

describe("navItemBadgeCount", () => {
  it("counts unread notifications on Inbox and pending proposals on Dreaming", () => {
    const counts = { unreadCount: 2, proposalsCount: 5 };
    expect(navItemBadgeCount(inboxRailItem.href, counts)).toBe(2);
    expect(navItemBadgeCount("/$profileId/dreaming", counts)).toBe(5);
    expect(navItemBadgeCount("/$profileId/memories", counts)).toBe(0);
  });
});

describe("shell uses a rail + panel + drawer", () => {
  it("composes SidebarRail in both desktop and drawer layouts", () => {
    const sidebar = read("../shell/Sidebar.tsx");
    expect(sidebar).toContain("AppSidebar");
    expect(sidebar).toContain("VmemSidebarRail");
    expect(sidebar).toContain("isDesktop={isDesktopViewport}");
    expect(sidebar).toContain('"desktop"');
    expect(sidebar).toContain('"drawer"');
    expect(sidebar).not.toContain("DialogPortal");
  });

  it("keeps settings / skills / memories as panel modes", () => {
    const navigation = read("SidebarNavigation.tsx");
    expect(navigation).toContain("SettingsSidebar");
    expect(navigation).toContain("SkillsSidebarNav");
    expect(navigation).toContain("MemoriesSidebarNav");
    expect(navigation).not.toContain("HomeSidebarNav");
    expect(navigation).not.toContain("InboxSidebarNav");
    expect(navigation).not.toContain("SourcesSidebarNav");
    expect(navigation).not.toContain('navView === "inbox"');
    expect(navigation).not.toContain('navView === "sources"');
    expect(navigation).not.toContain("ActivitySidebarNav");
    expect(navigation).not.toContain("WikiSidebarNav");
    expect(navigation).toContain('section === "team"');
  });

  it("does not draw a right border on the panel against floating content", () => {
    const sidebar = read("../shell/Sidebar.tsx");
    expect(sidebar).not.toMatch(/overflow-hidden border-r border-separator/);
    // AppShell floats the content card (md:p-2 + md:rounded-lg).
    expect(read("../shell/MainShell.tsx")).toContain("<AppShell");
  });

  it("keeps the rail/panel divider only while the panel is open", () => {
    const rail = read("SidebarRail.tsx");
    expect(rail).toContain("showRailPanelDivider");
    expect(rail).toContain("showDivider={showRailPanelDivider}");
    expect(rail).toContain('layout === "desktop" && isCollapsed');
    expect(rail).toContain("!isPanelHidden");
  });

  it("drops the sidebar panel column on home, artifacts, usage, traces, dreaming, inbox and sources", () => {
    for (const section of [
      "home",
      "artifacts",
      "usage",
      "traces",
      "dreaming",
      "inbox",
      "sources",
    ] as const) {
      expect(railSectionHidesPanel(section)).toBe(true);
      expect(Object.keys(panelTitleBySection)).not.toContain(section);
    }
    for (const section of [
      "memories",
      "skills",
      "files",
      "team",
      "settings",
    ] as const) {
      expect(railSectionHidesPanel(section)).toBe(false);
    }
    expect(panelTitleBySection.files).toBe("Files");

    const sidebar = read("../shell/Sidebar.tsx");
    expect(sidebar).toContain("railSectionHidesPanel(section)");
    expect(sidebar).toContain("collapsed={isCollapsed}");
    expect(sidebar).toContain("panelHidden={hidePanel}");
    expect(sidebar).toContain("panelSection === null ? null");
    expect(sidebar).toContain("isPanelHidden={hidePanel}");

    const shell = read("../shell/MainShell.tsx");
    expect(shell).toContain(
      "railSectionHidesPanel(railSectionFromPathname(pathname))",
    );
    expect(shell).toContain("panelHidden={isPanelHidden}");
    expect(shell).toContain('railWidth="var(--vmem-sidebar-rail-width)"');
    expect(shell).toContain('sidebarWidth="var(--vmem-sidebar-width)"');
    expect(shell).toContain(
      'mobileHeaderHeight="var(--vmem-mobile-header-height)"',
    );
    // Route-driven hiding never writes the stored collapse preference.
    expect(shell).toContain('"sidebar-collapsed"');
    expect(shell).not.toMatch(/setIsSidebarCollapsed\(\s*true/);
  });

  it("places inbox under home, then the divider, and no activity rail tile", () => {
    const railNav = read("SidebarRail.tsx");
    const homeIdx = railNav.indexOf('label="Home"');
    const inboxIdx = railNav.indexOf("item={inboxRailItem}", homeIdx);
    const dividerIdx = railNav.indexOf("<RailDivider />", inboxIdx);
    const libraryIdx = railNav.indexOf("railLibraryItems.map", dividerIdx);
    expect(homeIdx).toBeGreaterThan(-1);
    expect(inboxIdx).toBeGreaterThan(homeIdx);
    expect(dividerIdx).toBeGreaterThan(inboxIdx);
    expect(libraryIdx).toBeGreaterThan(dividerIdx);
    expect(railNav).toContain("railBadgeClass");
    expect(railNav).toContain("navItemBadgeCount(item.href");
    expect(read("NavLink.tsx")).toContain("navItemBadgeCount(item.href");
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
    // package static fill only: no sliding pill under rows that paint their own fill
    expect(stacked).not.toContain("SharedLayoutBackground");
    expect(() => read("SharedLayoutBackground.tsx")).toThrow();
    expect(() => read("sidebar-nav-row.ts")).toThrow();
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
    expect(read("../../routes/_main/$profileId/inbox/route.tsx")).not.toContain(
      "tabs=",
    );
  });

  it("parks a plus-only add control on the skills title row", () => {
    expect(read("SkillsSidebarNav.tsx")).toContain("SidebarHeaderTrailing");
    expect(read("SkillsSidebarNav.tsx")).toContain("Sidebar.NavItem");
    expect(read("../skills/SkillCard.tsx")).toContain("Sidebar.NavItem");
    expect(read("../shell/Sidebar.tsx")).toContain('from "@vvedantb/ui"');
    expect(read("../shell/Sidebar.tsx")).toContain("SidebarHeader");

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

describe("traces lives on the rail at /traces", () => {
  it("serves the trace list inside the shared page container", () => {
    const traces = read("../../routes/_main/$profileId/traces.tsx");
    expect(traces).toContain('createFileRoute("/_main/$profileId/traces")');
    expect(traces).toContain("PageContainer");
    expect(traces).toContain("TracesPanel");
  });

  it("pages the list and loads the detail only from the open dialog", () => {
    const panel = read("../traces/TracesPanel.tsx");
    expect(panel).toContain("api.mcpTraces.listMine");
    expect(panel).toContain("initialNumItems: PAGE_SIZE");
    expect(panel).toContain("Load more");
    expect(panel).toContain("last 7 days");
    const dialog = read("../traces/TraceDetailDialog.tsx");
    // the detail query lives in the body, which mounts only for a selected row
    expect(dialog).toContain("{row && <TraceDetailBody");
    expect(dialog).toContain("api.mcpTraces.getDetail");
  });
});

describe("artifacts lives on the rail at /artifacts", () => {
  it("serves the list and the viewer inside the shared page container", () => {
    const index = read("../../routes/_main/$profileId/artifacts/index.tsx");
    expect(index).toContain('createFileRoute("/_main/$profileId/artifacts/")');
    expect(index).toContain("PageContainer");
    expect(index).toContain("ArtifactsPanel");
    // team profiles list the team's artifacts, like Files
    expect(index).toContain("useActiveProfile().teamId");
    const detail = read(
      "../../routes/_main/$profileId/artifacts/$artifactId.tsx",
    );
    expect(detail).toContain(
      'createFileRoute("/_main/$profileId/artifacts/$artifactId")',
    );
    expect(detail).toContain("ArtifactDetailPanel");
    expect(read("../../routeTree.gen.ts")).toContain(
      "/$profileId/artifacts/$artifactId",
    );
  });

  it("pages the list and searches through the artifacts api", () => {
    const panel = read("../artifacts/ArtifactsPanel.tsx");
    expect(panel).toContain("api.artifacts.api.list");
    expect(panel).toContain("initialNumItems: PAGE_SIZE");
    expect(panel).toContain("const PAGE_SIZE = 50;");
    expect(panel).toContain("api.artifacts.api.search");
    expect(panel).toContain("Load more");
  });

  it("keeps viewer state, versions and links on the artifacts api", () => {
    const viewer = read("../artifacts/ArtifactDetailPanel.tsx");
    for (const fn of [
      "getState",
      "putState",
      "history",
      "getVersion",
      "restoreVersion",
      "refs",
    ]) {
      expect(viewer).toContain(`api.artifacts.api.${fn}`);
    }
    expect(viewer).toContain("/$profileId/memories/list/$id");
    const actions = read("../artifacts/useArtifactActions.ts");
    expect(actions).toContain("api.artifacts.api.remove");
    expect(actions).toContain("api.artifacts.api.restore");
    expect(actions).toContain('label: "Undo"');
  });

  it("renders bodies only through the shared @vvedantb/ui viewers", () => {
    for (const file of [
      "../artifacts/ArtifactsPanel.tsx",
      "../artifacts/ArtifactDetailPanel.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toContain("dangerouslySetInnerHTML");
      expect(source).not.toContain("<iframe");
      expect(source).not.toContain("srcDoc");
    }
    expect(read("../artifacts/ArtifactDetailPanel.tsx")).toContain(
      "ArtifactViewer",
    );
  });
});
