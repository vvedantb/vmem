import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  homeRailHref,
  isRailItemActive,
  navHrefToPath,
  railAccountItems,
  railLibraryItems,
  railSectionFromPathname,
  settingsRailItem,
  teamRailItem,
  navViewFromPathname,
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
    expect(railSectionFromPathname("/p1/inbox/proposals")).toBe("inbox");
    expect(railSectionFromPathname("/p1/activity/events")).toBe("activity");
    expect(railSectionFromPathname("/p1/team/settings")).toBe("team");
    expect(railSectionFromPathname("/settings/preferences")).toBe("settings");
  });

  it("folds nested sidebars into panel modes", () => {
    expect(navViewFromPathname("/settings/api")).toBe("settings");
    expect(navViewFromPathname("/p1/skills/hub")).toBe("skills");
    expect(navViewFromPathname("/p1/wiki/abc")).toBe("wiki");
    expect(navViewFromPathname("/p1/memories")).toBe("memories");
    expect(navViewFromPathname("/p1/memories/graph")).toBe("memories");
    expect(navViewFromPathname("/p1/activity/events")).toBe("activity");
  });
});

describe("rail destinations cover the previous sidebar nav", () => {
  it("keeps library, account, team, settings, and home reachable", () => {
    const hrefs = [
      homeRailHref,
      ...railLibraryItems.map((item) => item.href),
      ...railAccountItems.map((item) => item.href),
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
        "/$profileId/activity",
        "/$profileId/inbox",
        "/$profileId/team/members",
        "/settings",
      ]),
    );
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

  it("keeps settings / skills / wiki / memories / activity as panel modes", () => {
    const navigation = read("SidebarNavigation.tsx");
    expect(navigation).toContain("SettingsSidebar");
    expect(navigation).toContain("SkillsSidebarNav");
    expect(navigation).toContain("WikiSidebarNav");
    expect(navigation).toContain("MemoriesSidebarNav");
    expect(navigation).toContain("ActivitySidebarNav");
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
  });
});

describe("nested sidebar chrome", () => {
  it("hosts memory and activity views as stacked sidebar rows", () => {
    const memories = read("MemoriesSidebarNav.tsx");
    expect(memories).toContain("StackedSidebarNav");
    expect(memories).toContain("Graph");
    expect(memories).toContain("List");
    expect(memories).toContain("Timeline");
    expect(memories).toContain('aria-label="Memory views"');
    expect(memories).not.toContain("RouteTabs");
    expect(memories).not.toContain("fullWidth");

    const activity = read("ActivitySidebarNav.tsx");
    expect(activity).toContain("StackedSidebarNav");
    expect(activity).toContain("Usage");
    expect(activity).toContain("Events");
    expect(activity).toContain('aria-label="Activity views"');
    expect(activity).not.toContain("RouteTabs");
    expect(activity).not.toContain("fullWidth");

    const stacked = read("StackedSidebarNav.tsx");
    expect(stacked).toContain("NavLink");
    expect(stacked).toContain("SharedLayoutBackground");
    expect(stacked).not.toContain("RouteTabs");

    expect(read("../shell/RouteTabs.tsx")).not.toContain("fullWidth");
    expect(
      read("../../routes/_main/$profileId/memories/route.tsx"),
    ).not.toContain("leftSection");
    expect(
      read("../../routes/_main/$profileId/activity/route.tsx"),
    ).not.toContain("leftSection");
  });

  it("parks a plus-only add control on the skills and wiki title row", () => {
    expect(read("SkillsSidebarNav.tsx")).toContain("SidebarHeaderTrailing");
    expect(read("WikiSidebarNav.tsx")).toContain("SidebarHeaderTrailing");
    expect(read("SidebarHeader.tsx")).toContain('titleAlign === "start"');

    const addMenu = read("../shell/FeatureAddMenu.tsx");
    expect(addMenu).toContain('aria-label="Add"');
    expect(addMenu).toContain("IconPlus");
    expect(addMenu).not.toContain("IconChevronDown");
    expect(addMenu).not.toMatch(/>\s*Add\s*</);
  });
});
