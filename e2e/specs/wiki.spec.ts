import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe("wiki", { tag: ["@wiki", "@smoke"] }, () => {
  test("wiki workspace loads", async ({ page }) => {
    await gotoWorkspace(page, "/wiki");
    const empty = page.getByText(/No documents yet/);
    const pick = page.getByText(/Select a document from the sidebar/);
    const add = page.getByRole("button", { name: "Add" }).first();
    await expect(empty.or(pick).or(add)).toBeVisible({ timeout: 30_000 });
  });
});
