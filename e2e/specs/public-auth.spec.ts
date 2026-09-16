import { expect, test } from "../fixtures";
import { MARKETING_HERO } from "../helpers/landing";

test.describe(
  "public surfaces (signed in)",
  { tag: ["@public", "@landing", "@smoke"] },
  () => {
    test("visiting / redirects to the workspace, not marketing", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/[^/]+\/home/);
      await expect(
        page.getByRole("heading", { name: MARKETING_HERO }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
    });

    test("unknown first segments are in-app 404s, not marketing", async ({
      page,
    }) => {
      await page.goto("/this-page-does-not-exist-xyz");
      await expect(
        page.getByText("Workspace not found, or you don't have access to it."),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: MARKETING_HERO }),
      ).toHaveCount(0);
      await expect(page.getByText("Go to your workspace")).toBeVisible();
    });

    test("/docs is not Mintlify for signed-in users", async ({ page }) => {
      await page.goto("/docs");
      await expect(
        page.getByText("Workspace not found, or you don't have access to it."),
      ).toBeVisible();
    });

    test("sign out returns to the marketing page", async ({ page }) => {
      await page.getByRole("button", { name: /Account menu/ }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Sign out" }).click();
      await expect(
        page.getByRole("heading", { name: MARKETING_HERO }),
      ).toBeVisible({ timeout: 45_000 });
      await expect(page).toHaveURL(/\/$/);
    });
  },
);
