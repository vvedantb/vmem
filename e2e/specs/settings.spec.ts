import { expect, test } from "../fixtures";
import { gotoSettings } from "../helpers/nav";

test.describe("settings", { tag: ["@settings", "@smoke"] }, () => {
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
