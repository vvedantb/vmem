import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import {
  expectNoStackedSidebarRows,
  pageTab,
  railLink,
} from "../helpers/shell";

test.describe("inbox", { tag: ["@inbox", "@smoke"] }, () => {
  test("proposals and notifications tabs load", async ({ page }) => {
    await gotoWorkspace(page, "/inbox");
    await expect(pageTab(page, "Inbox")).toHaveAttribute(
      "data-state",
      "active",
      { timeout: 20_000 },
    );
    await expect(pageTab(page, "Proposals")).toBeVisible();
    await expect(pageTab(page, "Notifications")).toBeVisible();
    await expect(railLink(page, "Inbox")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expectNoStackedSidebarRows(page, ["Proposals", "Notifications"]);

    const awaiting = page.getByRole("heading", { name: "Awaiting review" });
    const noProposals = page.getByRole("heading", {
      name: "No pending proposals",
    });
    await expect(awaiting.or(noProposals)).toBeVisible({ timeout: 20_000 });

    await pageTab(page, "Notifications").click();
    await expect(page).toHaveURL(/\/inbox\/notifications/);
    await expect(page.locator("#main-content")).toBeVisible();
  });
});
