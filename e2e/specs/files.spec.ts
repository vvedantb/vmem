import { expect, test } from "../fixtures";
import { gotoWorkspace } from "../helpers/nav";

test.describe("files", { tag: ["@files", "@smoke"] }, () => {
  test("files workspace loads", async ({ page }) => {
    await gotoWorkspace(page, "/files");
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "No files yet" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
  });
});
