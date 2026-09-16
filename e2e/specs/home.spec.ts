import { expect, test } from "../fixtures";
import { mainContent } from "../helpers/memories";

test.describe(
  "home / dashboard",
  { tag: ["@home", "@dashboard", "@smoke"] },
  () => {
    test("loads workspace dashboard stats", async ({ page, profileId }) => {
      await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
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
    });
  },
);
