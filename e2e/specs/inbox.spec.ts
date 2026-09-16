import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe("inbox", { tag: ["@inbox", "@smoke"] }, () => {
  test("proposals and notifications tabs load", async ({ page }) => {
    await gotoWorkspace(page, "/inbox");
    await expect(page.getByRole("tab", { name: "Proposals" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("tab", { name: "Notifications" }),
    ).toBeVisible();

    const awaiting = page.getByRole("heading", { name: "Awaiting review" });
    const noProposals = page.getByRole("heading", {
      name: "No pending proposals",
    });
    await expect(awaiting.or(noProposals)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("tab", { name: "Notifications" }).click();
    await expect(page).toHaveURL(/\/inbox\/notifications/);
    await expect(page.locator("#main-content")).toBeVisible();
  });
});
