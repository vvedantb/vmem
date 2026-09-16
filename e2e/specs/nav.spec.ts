import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe("product nav", { tag: ["@nav", "@smoke"] }, () => {
  test("sidebar has no codebase surface and /codebases 404s", async ({
    page,
    profileId,
  }) => {
    await expect(page.getByRole("link", { name: "Memories" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wiki" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Skills" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("link", { name: /codebases/i })).toHaveCount(0);

    await page.goto("/codebases");
    await expect(
      page.getByText("Workspace not found, or you don't have access to it."),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /codebases/i })).toHaveCount(0);

    await gotoWorkspace(page, "/home");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
  });
});
