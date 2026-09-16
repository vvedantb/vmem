import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe(
  "memories tags",
  { tag: ["@memories", "@tags", "@smoke"] },
  () => {
    test("tags view is reachable from the list chrome", async ({ page }) => {
      await gotoWorkspace(page, "/memories/list");
      await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole("button", { name: /Change view/ }).click();
      await page.getByRole("menuitem", { name: "Tags" }).click();
      await expect(page).toHaveURL(/view=tags/);
      await expect(
        page.getByRole("textbox", { name: "Search" }),
      ).toHaveAttribute("placeholder", /Search tags/i);
      await expect(page.getByText("No tags yet")).toBeVisible({
        timeout: 20_000,
      });
    });
  },
);
