import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe("activity", { tag: ["@activity", "@smoke"] }, () => {
  test("usage and events tabs load", async ({ page }) => {
    await gotoWorkspace(page, "/activity");
    await expect(page.getByRole("tab", { name: "Usage" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: "Events" })).toBeVisible();
    await expect(page.getByText("Total cost")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Total tokens")).toBeVisible();

    await page.getByRole("tab", { name: "Events" }).click();
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
