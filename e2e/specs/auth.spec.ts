import { expect, test } from "../fixtures";
import { assertNoFatalChrome } from "../helpers/shell";

test.describe("session restore", { tag: ["@auth", "@smoke"] }, () => {
  test("signed-in / and /home resolve to /$profileId/home", async ({
    page,
    profileId,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/home`), {
      timeout: 45_000,
    });
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await assertNoFatalChrome(page);

    await page.goto("/home");
    await expect(page).toHaveURL(new RegExp(`/${profileId}/home`), {
      timeout: 45_000,
    });
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await assertNoFatalChrome(page);

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${profileId}/home`));
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
      timeout: 30_000,
    });
    await assertNoFatalChrome(page);
  });

  test("unknown workspace shows not-found, not Show Error", async ({
    page,
  }) => {
    await page.goto("/not-a-real-profile/home");
    await expect(
      page.getByText("Workspace not found, or you don't have access to it."),
    ).toBeVisible({ timeout: 20_000 });
    await assertNoFatalChrome(page);
    await expect(
      page.getByRole("link", { name: "Go to your workspace" }),
    ).toBeVisible();
  });
});
