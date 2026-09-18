import { expect, test } from "../fixtures";
import { gotoSettings, gotoWorkspace } from "../helpers/nav";
import { mainContent } from "../helpers/memories";
import {
  assertNoFatalChrome,
  clickRail,
  openWorkspaceSwitcher,
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
    await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
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

    await clickRail(page, "Home");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(
      sidebarPanel(page).getByRole("heading", { name: "Home" }),
    ).toBeVisible();
    await expect(sidebarViewLink(page, "Usage")).toBeVisible();
    await expect(sidebarViewLink(page, "Events")).toBeVisible();
    await assertNoFatalChrome(page);

    await sidebarViewLink(page, "Usage").click();
    await expect(page).toHaveURL(new RegExp(`/${profileId}/activity/usage`));
    await expect(
      sidebarPanel(page).getByRole("heading", { name: "Home" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Home", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await assertNoFatalChrome(page);

    await clickRail(page, "Inbox");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/inbox`));
    await expect(sidebarViewLink(page, "Proposals")).toBeVisible({
      timeout: 20_000,
    });
    await expect(sidebarViewLink(page, "Notifications")).toBeVisible();
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
        name: "Secrets",
        url: /\/settings\/secrets/,
        check: async () => {
          await expect(
            page.getByRole("heading", { name: "Secrets", exact: true }),
          ).toBeVisible();
        },
      },
      {
        name: "Connectors",
        url: /\/settings\/connectors/,
        check: async () => {
          await expect(
            page.getByRole("heading", { name: "Connectors", exact: true }),
          ).toBeVisible();
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
          await expect(page.getByRole("tab", { name: "Import" })).toBeVisible();
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
    await gotoWorkspace(page, "/home");
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

    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Show sidebar" }),
    ).toBeVisible();
    await expect(mainContent(page)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
    await page.getByRole("button", { name: "Show sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Hide sidebar" }),
    ).toBeVisible();
    await expect(
      sidebarPanel(page).getByRole("heading", { name: "Home" }),
    ).toBeVisible();
  });
});
