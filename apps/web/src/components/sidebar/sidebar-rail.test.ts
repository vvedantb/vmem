import { describe, expect, it } from "vitest";
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
  });

  it("still lists inbox and sources in the command palette groups", () => {
    const paletteHrefs = navGroups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(paletteHrefs).toContain("/$profileId/inbox");
    expect(paletteHrefs).toContain("/$profileId/sources");
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

describe("rail sections that hide the sidebar panel", () => {
  it("hides the panel on home, artifacts, usage, traces, dreaming, inbox and sources", () => {
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
  });
});
