import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe(
  "memories timeline",
  { tag: ["@memories", "@timeline", "@smoke"] },
  () => {
    test("timeline chrome loads from the memories tabs", async ({ page }) => {
      await gotoWorkspace(page, "/memories/graph");
      await expect(page.getByRole("tab", { name: "Timeline" })).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole("tab", { name: "Timeline" }).click();
      await expect(page).toHaveURL(/\/memories\/timeline/);
      await expect(
        page.getByRole("slider", { name: "Scrub through memory time" }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole("group", { name: "Time window size" }),
      ).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Add memory" }),
      ).toBeVisible();
      await expect(page.getByRole("tab", { name: "Graph" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "List" })).toBeVisible();
    });
  },
);
