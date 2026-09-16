import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import { signInAsEva, signOutFromApp } from "../helpers/auth";
import { AUTH_STATE_PATH, requireE2ECredentials } from "../helpers/env";
import { openAccountMenu } from "../helpers/shell";

test.describe("sign-out", { tag: ["@auth", "@smoke"] }, () => {
  test("account menu signs out to the landing page", async ({ page }) => {
    await gotoWorkspace(page, "/home");
    const menu = await openAccountMenu(page);
    await expect(
      menu.getByRole("menuitem", { name: "Sign out" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await signOutFromApp(page);
    await expect(
      page.getByRole("heading", { name: /Memory your agents can/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Memories" })).toHaveCount(0);

    await page.goto("/home");
    await expect(
      page.getByRole("button", { name: "Sign in" }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/[^/]+\/home/);

    const creds = requireE2ECredentials();
    await signInAsEva(page, creds);
    await page.context().storageState({ path: AUTH_STATE_PATH });
  });
});
