import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import { sidebarPanel } from "../helpers/shell";

test.describe(
  "memories graph",
  { tag: ["@memories", "@graph", "@smoke"] },
  () => {
    test("graph chrome loads", async ({ page }) => {
      await gotoWorkspace(page, "/memories/graph");
      const panel = sidebarPanel(page);
      await expect(panel.getByRole("tab", { name: "Graph" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(panel.getByRole("tab", { name: "List" })).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Search nodes" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Add memory" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Failed to load graph" }),
      ).toHaveCount(0);
    });
  },
);
