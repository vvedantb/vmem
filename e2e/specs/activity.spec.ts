import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import { sidebarViewLink } from "../helpers/shell";

test.describe("activity", { tag: ["@activity", "@smoke"] }, () => {
  test("usage and events sidebar rows load", async ({ page }) => {
    await gotoWorkspace(page, "/activity");
    await expect(sidebarViewLink(page, "Usage")).toBeVisible({
      timeout: 20_000,
    });
    await expect(sidebarViewLink(page, "Events")).toBeVisible();
    await expect(page.getByText("Total cost")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Total tokens")).toBeVisible();

    await sidebarViewLink(page, "Events").click();
    await expect(page).toHaveURL(/\/activity\/events/);
    const empty = page.getByRole("heading", { name: "No activity yet" });
    const filtered = page.getByRole("heading", {
      name: "No matching activity",
    });
    const filters = page.getByRole("button", { name: /Filters/ });
    await expect(empty.or(filtered).or(filters)).toBeVisible({
      timeout: 20_000,
    });
  });
});
