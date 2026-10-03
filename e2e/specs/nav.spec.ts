import { expect, test } from "../fixtures";
import { gotoSettings, gotoWorkspace } from "../helpers/nav";
import { mainContent } from "../helpers/memories";
import {
  assertNoFatalChrome,
  clickRail,
  expectNoStackedSidebarRows,
  openWorkspaceSwitcher,
  pageTab,
  railLink,
  sidebarPanel,
  sidebarViewLink,
} from "../helpers/shell";

test.describe("product nav", { tag: ["@nav", "@smoke"] }, () => {
  test("sidebar has no codebase surface and /codebases 404s", async ({
    page,
    profileId,
  }) => {
    await expect(page.getByRole("link", { name: "Memories" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wiki" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Skills" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Files" })).toBeVisible();
    await expect(railLink(page, "Usage")).toBeVisible();
    await expect(railLink(page, "Sources")).toBeVisible();
    await expect(railLink(page, "Inbox")).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Home", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Activity", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: /codebases/i })).toHaveCount(0);

    await page.goto("/codebases");
    await expect(
      page.getByText("Workspace not found, or you don't have access to it."),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /codebases/i })).toHaveCount(0);

    await gotoWorkspace(page, "/home");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
      timeout: 20_000,
    });
    for (const name of ["Dashboard", "Inbox", "Sources"]) {
      await expect(pageTab(page, name)).toHaveCount(0);
    }
  });

  test("left rail reaches every primary destination", async ({
    page,
    profileId,
  }) => {
    const main = mainContent(page);

    await clickRail(page, "Memories");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/memories`));
    await expect(sidebarViewLink(page, "Graph")).toBeVisible({
      timeout: 20_000,
    });
    await expect(sidebarViewLink(page, "List")).toBeVisible();
    await expect(sidebarViewLink(page, "Tags")).toBeVisible();
    await expect(sidebarViewLink(page, "Timeline")).toBeVisible();
    await assertNoFatalChrome(page);

    await clickRail(page, "Wiki");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/wiki`));
    await expect(
      sidebarPanel(page).getByRole("heading", { name: "Wiki" }),
    ).toBeVisible();
    await expect(
      sidebarPanel(page).getByRole("button", { name: "Add" }),
    ).toBeVisible();
    await expect(main).toBeVisible();
    await assertNoFatalChrome(page);

    await clickRail(page, "Skills");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/skills`));
    await expect(
      sidebarPanel(page).getByRole("heading", { name: "Skills" }),
    ).toBeVisible();
    await expect(
      sidebarPanel(page).getByRole("button", { name: "Add" }),
    ).toBeVisible();
    await assertNoFatalChrome(page);

    await clickRail(page, "Files");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/files`));
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 20_000,
    });
    await assertNoFatalChrome(page);

    await clickRail(page, "Sources");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/sources`));
    await expect(railLink(page, "Sources")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(pageTab(page, "Connectors")).toBeVisible({
      timeout: 20_000,
    });
    await expect(pageTab(page, "Import")).toBeVisible();
    await expect(pageTab(page, "Sources")).toHaveCount(0);
    await expect(
      mainContent(page).getByRole("heading", { name: "Sources", exact: true }),
    ).toBeVisible();
    await expect(
      sidebarPanel(page).getByRole("heading", { name: "Sources" }),
    ).toHaveCount(0);
    await expectNoStackedSidebarRows(page, ["Connectors", "Import"]);
    await assertNoFatalChrome(page);

    await clickRail(page, "Home");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    // Home has no sidebar panel: the page sits beside the rail.
    await expect(
      sidebarPanel(page).getByRole("heading", { name: "Home" }),
    ).toHaveCount(0);
    // Usage is a rail tile now, so Home has no stacked Usage / Events rows.
    await expect(
      sidebarPanel(page).getByRole("navigation", { name: "Home views" }),
    ).toHaveCount(0);
    await expect(sidebarViewLink(page, "Events")).toHaveCount(0);
    await assertNoFatalChrome(page);

    await clickRail(page, "Usage");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/usage$`));
    await expect(railLink(page, "Usage")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByText("Total cost")).toBeVisible({ timeout: 20_000 });
    await expect(
      sidebarPanel(page).getByRole("heading", { name: "Usage" }),
    ).toHaveCount(0);
    await assertNoFatalChrome(page);

    await clickRail(page, "Inbox");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/inbox`));
    await expect(railLink(page, "Inbox")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(pageTab(page, "Proposals")).toBeVisible({
      timeout: 20_000,
    });
    await expect(pageTab(page, "Notifications")).toBeVisible();
    await expect(pageTab(page, "Inbox")).toHaveCount(0);
    await expect(
      mainContent(page).getByRole("heading", { name: "Inbox", exact: true }),
    ).toBeVisible();
    await expect(
      sidebarPanel(page).getByRole("heading", { name: "Inbox" }),
    ).toHaveCount(0);
    await expectNoStackedSidebarRows(page, ["Proposals", "Notifications"]);
    await assertNoFatalChrome(page);

    await clickRail(page, "Settings");
    await expect(page).toHaveURL(/\/settings\/preferences/);
    await expect(
      page.getByRole("heading", { name: "Preferences", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await assertNoFatalChrome(page);
  });

  test("settings panel reaches every settings page", async ({ page }) => {
    await gotoSettings(page, "/preferences");
    const panel = sidebarPanel(page);
    await expect(
      panel.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();

    const pages: { name: string; url: RegExp; check: () => Promise<void> }[] = [
      {
        name: "Preferences",
        url: /\/settings\/preferences/,
        check: async () => {
          await expect(
            page.getByRole("heading", { name: "Preferences", exact: true }),
          ).toBeVisible();
        },
      },
      {
        name: "Profiles",
        url: /\/settings\/profiles/,
        check: async () => {
          await expect(
            page.getByRole("heading", { name: "Profiles", exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole("button", { name: "New Profile" }),
          ).toBeVisible();
        },
      },
      {
        name: "API",
        url: /\/settings\/api/,
        check: async () => {
          await expect(page.getByRole("tab", { name: "Usage" })).toBeVisible();
        },
      },
      {
        name: "Extension",
        url: /\/settings\/extension/,
        check: async () => {
          await expect(
            page.getByRole("heading", { name: "Extension", exact: true }),
          ).toBeVisible();
        },
      },
      {
        name: "Data Controls",
        url: /\/settings\/data-controls/,
        check: async () => {
          await expect(page.getByRole("tab", { name: "Export" })).toBeVisible();
          await expect(page.getByRole("tab", { name: "Import" })).toHaveCount(
            0,
          );
        },
      },
    ];

    for (const dest of pages) {
      await panel.getByRole("link", { name: dest.name, exact: true }).click();
      await expect(page).toHaveURL(dest.url);
      await dest.check();
      await assertNoFatalChrome(page);
    }
  });

  test("workspace switcher lists the current profile", async ({ page }) => {
    // Home and Usage have no sidebar panel; Files keeps the switcher.
    await gotoWorkspace(page, "/files");
    const menu = await openWorkspaceSwitcher(page);
    await expect(
      menu.getByRole("menuitem", { name: "Personal" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Create profile" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Create team" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Manage profiles" }),
    ).toBeVisible();
    await menu.getByRole("menuitem", { name: "Manage profiles" }).click();
    await expect(page).toHaveURL(/\/settings\/profiles/);
    await expect(
      page.getByRole("heading", { name: "Profiles", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("search palette and sidebar collapse stay on the shell", async ({
    page,
    profileId,
  }) => {
    await gotoWorkspace(page, "/home");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(
      page.getByPlaceholder(/Search memories, wiki, skills/),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByPlaceholder(/Search memories, wiki, skills/),
    ).toHaveCount(0);
    await assertNoFatalChrome(page);

    // Home hides the panel by route, so round-trip collapse on Wiki.
    await clickRail(page, "Wiki");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/wiki`));
    const wikiHeading = sidebarPanel(page).getByRole("heading", {
      name: "Wiki",
    });
    await expect(wikiHeading).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Show sidebar" }),
    ).toBeVisible();
    await expect(wikiHeading).toBeHidden();
    await expect(mainContent(page)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${profileId}/wiki`));
    await page.getByRole("button", { name: "Show sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Hide sidebar" }),
    ).toBeVisible();
    await expect(wikiHeading).toBeVisible();
  });
});
