import { expect, test } from "../fixtures";
import { mainContent } from "../helpers/memories";
import {
  assertNoFatalChrome,
  clickRail,
  statCardValue,
} from "../helpers/shell";

test.describe(
  "home / dashboard",
  { tag: ["@home", "@dashboard", "@smoke"] },
  () => {
    test("loads workspace dashboard stats", async ({ page, profileId }) => {
      await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
      await assertNoFatalChrome(page);
      const main = mainContent(page);
      await expect(
        main.locator("p").filter({ hasText: /^Total memories$/ }),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        main.locator("p").filter({ hasText: /^Added today$/ }),
      ).toBeVisible();
      await expect(
        main.locator("p").filter({ hasText: /^This week$/ }),
      ).toBeVisible();
      await expect(
        main.locator("p").filter({ hasText: /^Tags used$/ }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Memories" })).toBeVisible();
      await expect(
        main.getByRole("heading", { name: "Memory growth" }),
      ).toBeVisible();
      await expect(main.getByText("Last 7 days").first()).toBeVisible();
    });

    test("returning from settings keeps dashboard stats", async ({ page }) => {
      const total = statCardValue(page, "Total memories");
      await expect(total).toHaveText(/^\d[\d,]*$/, { timeout: 30_000 });
      const before = (await total.innerText()).trim();
      await assertNoFatalChrome(page);

      await clickRail(page, "Settings");
      await expect(page).toHaveURL(/\/settings\/preferences/);
      await expect(
        page.getByRole("heading", { name: "Preferences", exact: true }),
      ).toBeVisible({ timeout: 20_000 });

      await clickRail(page, "Home");
      await expect(page).toHaveURL(/\/[^/]+\/home/);
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
      await assertNoFatalChrome(page);
      await expect(total).toHaveText(before, { timeout: 15_000 });
    });
  },
);
