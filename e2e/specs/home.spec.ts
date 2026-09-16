import { expect, test } from "../fixtures";

test.describe(
  "home / dashboard",
  { tag: ["@home", "@dashboard", "@smoke"] },
  () => {
    test("loads workspace dashboard stats", async ({ page, profileId }) => {
      await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
      await expect(page.getByText("Total memories")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Added today")).toBeVisible();
      await expect(page.getByText("This week")).toBeVisible();
      await expect(page.getByText("Tags used")).toBeVisible();
      await expect(page.getByRole("link", { name: "Memories" })).toBeVisible();
    });
  },
);
