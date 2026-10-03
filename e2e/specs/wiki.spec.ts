import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";
import { sidebarPanel } from "../helpers/shell";

test.describe("wiki", { tag: ["@wiki", "@smoke"] }, () => {
  test("wiki workspace loads", async ({ page }) => {
    await gotoWorkspace(page, "/wiki");
    await expect(
      sidebarPanel(page).getByRole("button", { name: "Add" }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(
        "Select a document from the sidebar, or use Add to create one.",
        { exact: true },
      ),
    ).toBeVisible();
  });
});
