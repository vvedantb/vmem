import { expect, test } from "../fixtures";
import { gotoSettings } from "../helpers/nav";

test.describe("settings", { tag: ["@settings", "@smoke"] }, () => {
  test("redirects /settings to preferences with grouped nav", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/preferences/, {
      timeout: 20_000,
    });
    await expect(page.locator("#main-content")).toBeVisible();
    const nav = page.locator("nav").filter({ hasText: "Preferences" });
    await expect(nav.getByText("General", { exact: true })).toBeVisible();
    await expect(nav.getByText("Developer", { exact: true })).toBeVisible();
    await expect(nav.getByText("Integrations", { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Profiles" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "API" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Secrets" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Connectors" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Extension" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Data Controls" }),
    ).toBeVisible();
  });

  test("preferences", async ({ page }) => {
    await gotoSettings(page, "/preferences");
    await expect(
      page.getByRole("heading", { name: "Preferences", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("About me")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Memory Behavior" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Dream Mode" }),
    ).toBeVisible();
    await expect(page.getByText("Auto-extract memories")).toBeVisible();

    const notifyNew = page.getByRole("switch", { name: "New memories" });
    await expect(notifyNew).toBeVisible();
    const wasChecked = await notifyNew.isChecked();
    await notifyNew.click();
    await expect(page.getByText("Saved!")).toBeVisible();
    await notifyNew.click();
    await expect(page.getByText("Saved!").first()).toBeVisible();
    await expect(notifyNew).toBeChecked({ checked: wasChecked });
  });

  test("profiles", async ({ page }) => {
    await gotoSettings(page, "/profiles");
    await expect(
      page.getByRole("heading", { name: "Profiles", exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "New Profile" }),
    ).toBeVisible();
    await expect(page.getByText("Browser extension")).toBeVisible();
  });

  test("api usage and keys", async ({ page }) => {
    await gotoSettings(page, "/api");
    await expect(page.getByRole("tab", { name: "Usage" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: "Keys" })).toBeVisible();
    await expect(page.getByText("Total requests")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("tab", { name: "Keys" }).click();
    await expect(page).toHaveURL(/\/settings\/api\/keys/);
    await expect(page.getByRole("button", { name: "New Key" })).toBeVisible();
  });

  test("secrets", async ({ page }) => {
    await gotoSettings(page, "/secrets");
    await expect(
      page.getByRole("heading", { name: "Secrets", exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Add Variable" }),
    ).toBeVisible();
    await expect(page.getByText(/encrypted at rest/i)).toBeVisible();
  });

  test("connectors", async ({ page }) => {
    await gotoSettings(page, "/connectors");
    await expect(
      page.getByRole("heading", { name: "Connectors", exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Browse Connectors" }).first(),
    ).toBeVisible();
  });

  test("extension", async ({ page }) => {
    await gotoSettings(page, "/extension");
    await expect(
      page.getByRole("heading", { name: "Extension", exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Auto-sync")).toBeVisible();
    await expect(page.getByText("Save popup on text selection")).toBeVisible();
    const autoSync = page.getByRole("switch", { name: "Auto-sync" });
    await expect(autoSync).toBeVisible();
    const wasChecked = await autoSync.isChecked();
    await autoSync.click();
    await expect(page.getByText("Saved!")).toBeVisible();
    await autoSync.click();
    await expect(page.getByText("Saved!").first()).toBeVisible();
    await expect(autoSync).toBeChecked({ checked: wasChecked });
  });

  test("command palette opens extension settings", async ({ page }) => {
    await gotoSettings(page, "/preferences");
    await page.getByRole("button", { name: "Search" }).click();
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();
    await palette.getByPlaceholder(/Search memories/i).fill("Extension");
    await palette
      .getByRole("option", { name: /Extension/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/settings\/extension/);
    await expect(page.getByText("Auto-sync")).toBeVisible();
  });

  test("account menu opens Clerk manage account", async ({ page }) => {
    await gotoSettings(page, "/preferences");
    await page.getByRole("button", { name: /Account menu/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Manage account" }),
    ).toBeVisible();
    await page.getByRole("menuitem", { name: "Manage account" }).click();
    await expect(page.getByText(/profile details|email address/i)).toBeVisible({
      timeout: 20_000,
    });
    await page.keyboard.press("Escape");
  });

  test("data controls", async ({ page }) => {
    await gotoSettings(page, "/data-controls");
    await expect(page.getByRole("tab", { name: "Import" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: "Export" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Data Control" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Import" }).first(),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Export" }).click();
    await expect(
      page.getByRole("heading", { name: "Export coming soon" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Data Control" }).click();
    await expect(
      page.getByRole("heading", { name: "Delete all memories" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete all memories" }),
    ).toBeVisible();
  });
});

test.describe("settings mobile", { tag: ["@settings", "@mobile"] }, () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("drawer lists grouped settings and keeps toggles usable", async ({
    page,
  }) => {
    await gotoSettings(page, "/preferences");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const nav = page.locator("nav").filter({ hasText: "Preferences" });
    await expect(nav.getByText("General", { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Extension" })).toBeVisible();
    await nav.getByRole("link", { name: "API" }).click();
    await expect(page.getByRole("tab", { name: "Usage" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: "Keys" })).toBeVisible();

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page
      .locator("nav")
      .filter({ hasText: "Preferences" })
      .getByRole("link", { name: "Preferences" })
      .click();
    await expect(
      page.getByRole("switch", { name: "Auto-extract memories" }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "Daily schedule" }),
    ).toBeVisible();
  });
});
