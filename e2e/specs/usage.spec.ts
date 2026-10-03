import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe("usage", { tag: ["@usage", "@smoke"] }, () => {
  test("old /activity URLs redirect to /usage", async ({ page, profileId }) => {
    for (const path of ["/activity", "/activity/usage"]) {
      await gotoWorkspace(page, path);
      await expect(page).toHaveURL(new RegExp(`/${profileId}/usage$`));
      await expect(page.getByText("Total cost")).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText("Total tokens")).toBeVisible();
    }
  });

  test("the events page is gone", async ({ page, profileId }) => {
    // 404s through the root not-found page, which renders outside the shell
    await page.goto(`/${profileId}/activity/events`);
    await expect(page.getByText("This page doesn't exist.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("No activity yet")).toHaveCount(0);
  });
});
