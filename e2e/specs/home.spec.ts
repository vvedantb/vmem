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
        main.getByText("Total memories", { exact: true }),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        main.getByText("Added today", { exact: true }),
      ).toBeVisible();
      await expect(main.getByText("This week", { exact: true })).toBeVisible();
      await expect(main.getByText("Tags used", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Memories" })).toBeVisible();
    });
  },
);
