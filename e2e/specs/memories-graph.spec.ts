import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe(
  "memories graph",
  { tag: ["@memories", "@graph", "@smoke"] },
  () => {
    test("graph chrome loads", async ({ page }) => {
      await gotoWorkspace(page, "/memories/graph");
      await expect(page.getByRole("tab", { name: "Graph" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("tab", { name: "List" })).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Search nodes" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Add memory" }),
      ).toBeVisible();

      const canvas = page.getByTestId("memory-graph");
      const empty = page.getByRole("heading", {
        name: "No memories to visualize",
      });
      const error = page.getByRole("heading", { name: "Failed to load graph" });
      await expect(canvas.or(empty).or(error)).toBeVisible({ timeout: 30_000 });
      await expect(error).toHaveCount(0);
    });
  },
);
